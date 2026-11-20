import api, {
  getSavedSession,
  isActionUnsupported,
  markActionUnsupported,
} from './gasApi';

export const SYNC_DOMAINS = [
  'teachers',
  'attendances',
  'payrolls',
  'disbursements',
  'notifications',
  'school_profile',
];

const BROADCAST_CHANNEL_NAME = 'sipayroll_realtime_sync_v1';
const STORAGE_PING_KEY = 'sipayroll_sync_ping_v1';
const TAB_ID = `tab_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const dataChangeListeners = new Set();
const notifListeners = new Set();

let knownVersions = null;
let lastNotifSnapshot = { items: [], unreadCount: 0 };
let pollTimerId = null;
let syncRunning = false;
let pollInFlight = false;
let lastHiddenAt = 0;
let broadcastChannel = null;
let listenersAttached = false;

function getBroadcastChannel() {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null;
  if (!broadcastChannel) {
    try {
      broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      broadcastChannel.onmessage = (event) => {
        handleCrossTabSyncMessage(event?.data);
      };
    } catch {
      broadcastChannel = null;
    }
  }
  return broadcastChannel;
}

function handleCrossTabSyncMessage(msg) {
  if (!msg || msg.tabId === TAB_ID) return;
  if (Array.isArray(msg.domains) && msg.domains.length > 0) {
    emitDataChange(msg.domains, {
      source: 'broadcast',
      broadcast: false,
      versions: msg.versions || null,
    });
  }
}

function ensureCrossTabStorageListener() {
  if (typeof window === 'undefined' || listenersAttached) return;
  listenersAttached = true;
  getBroadcastChannel();
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_PING_KEY || !e.newValue) return;
    try {
      const parsed = JSON.parse(e.newValue);
      handleCrossTabSyncMessage(parsed);
    } catch {
      // Ignore malformed ping
    }
  });
}

export function emitDataChange(domains, meta = {}) {
  ensureCrossTabStorageListener();
  const domainList = (Array.isArray(domains) ? domains : [domains]).filter(Boolean);
  if (domainList.length === 0) return;

  if (meta.versions) {
    seedServerVersions(meta.versions);
  }

  dataChangeListeners.forEach((cb) => {
    try {
      cb(domainList, meta);
    } catch {
      // Isolate subscriber errors
    }
  });

  if (meta.broadcast !== false && typeof window !== 'undefined') {
    const packet = {
      tabId: TAB_ID,
      domains: domainList,
      versions: meta.versions || null,
      ts: Date.now(),
    };
    const ch = getBroadcastChannel();
    if (ch) {
      try {
        ch.postMessage(packet);
      } catch {
        // Ignore closed channel
      }
    }
    try {
      localStorage.setItem(STORAGE_PING_KEY, JSON.stringify(packet));
    } catch {
      // Ignore storage quota / privacy mode error
    }
  }
}

export function subscribeDataChange(listener) {
  ensureCrossTabStorageListener();
  dataChangeListeners.add(listener);
  return () => {
    dataChangeListeners.delete(listener);
  };
}

export function publishNotificationsSnapshot(snapshot, options = {}) {
  const safe = {
    items: Array.isArray(snapshot?.items) ? snapshot.items : [],
    unreadCount: Number(snapshot?.unreadCount || 0),
  };
  lastNotifSnapshot = safe;
  notifListeners.forEach((cb) => {
    try {
      cb(safe, options);
    } catch {
      // Isolate subscriber error
    }
  });
}

export function subscribeNotificationsSnapshot(listener) {
  notifListeners.add(listener);
  if (lastNotifSnapshot) {
    try {
      listener(lastNotifSnapshot, { announceNew: false });
    } catch {
      // Ignore
    }
  }
  return () => {
    notifListeners.delete(listener);
  };
}

export function seedServerVersions(versionsObj) {
  if (!versionsObj || typeof versionsObj !== 'object') return;
  if (!knownVersions) {
    knownVersions = { ...versionsObj };
    return;
  }
  SYNC_DOMAINS.forEach((domain) => {
    const nextVal = Number(versionsObj[domain] || 0);
    const prevVal = Number(knownVersions[domain] || 0);
    if (nextVal > prevVal) {
      knownVersions[domain] = nextVal;
    }
  });
}

async function runSyncCheckTick() {
  if (!syncRunning || pollInFlight) return;
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
  const session = getSavedSession();
  if (!session) return;

  pollInFlight = true;
  try {
    if (!isActionUnsupported('sync.versions')) {
      try {
        const res = await api.get('sync.versions');
        const nextVersions = res?.versions;
        if (nextVersions && typeof nextVersions === 'object') {
          if (!knownVersions) {
            knownVersions = { ...nextVersions };
          } else {
            const changedDomains = [];
            SYNC_DOMAINS.forEach((domain) => {
              const nextVal = Number(nextVersions[domain] || 0);
              const prevVal = Number(knownVersions[domain] || 0);
              if (nextVal > prevVal) {
                changedDomains.push(domain);
                knownVersions[domain] = nextVal;
              }
            });
            if (changedDomains.length > 0) {
              emitDataChange(changedDomains, {
                source: 'remote_poll',
                versions: nextVersions,
                broadcast: false,
              });
            }
          }
        }
        return;
      } catch (err) {
        if (err?.status === 404 || String(err?.message || '').includes('404')) {
          markActionUnsupported('sync.versions');
        } else {
          return;
        }
      }
    }

    // Legacy fallback when GAS is still on v16 or older (no sync.versions)
    const notifRes = await api.get('notifications.list');
    publishNotificationsSnapshot(notifRes, { announceNew: true });
  } catch {
    // Silent background polling error
  } finally {
    pollInFlight = false;
  }
}

let visibilityHandler = null;
let onlineHandler = null;

export function startRealtimeVersionSync({ intervalMs = 12000, legacyIntervalMs = 25000 } = {}) {
  ensureCrossTabStorageListener();
  stopRealtimeVersionSync();

  syncRunning = true;
  const effectiveMs = isActionUnsupported('sync.versions') ? legacyIntervalMs : intervalMs;
  pollTimerId = setInterval(() => {
    runSyncCheckTick();
  }, effectiveMs);

  if (typeof document !== 'undefined') {
    visibilityHandler = () => {
      if (document.visibilityState === 'hidden') {
        lastHiddenAt = Date.now();
      } else if (document.visibilityState === 'visible') {
        if (!lastHiddenAt || Date.now() - lastHiddenAt >= 4000) {
          runSyncCheckTick();
        }
      }
    };
    document.addEventListener('visibilitychange', visibilityHandler);
  }

  if (typeof window !== 'undefined') {
    onlineHandler = () => {
      runSyncCheckTick();
    };
    window.addEventListener('online', onlineHandler);
  }
}

export function stopRealtimeVersionSync() {
  syncRunning = false;
  if (pollTimerId) {
    clearInterval(pollTimerId);
    pollTimerId = null;
  }
  if (visibilityHandler && typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', visibilityHandler);
    visibilityHandler = null;
  }
  if (onlineHandler && typeof window !== 'undefined') {
    window.removeEventListener('online', onlineHandler);
    onlineHandler = null;
  }
}

export function resetRealtimeSyncState() {
  stopRealtimeVersionSync();
  knownVersions = null;
  lastNotifSnapshot = { items: [], unreadCount: 0 };
  pollInFlight = false;
}

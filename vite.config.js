import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Shared middleware handler for `/__gas_proxy__`
 * Works in both `vite dev` and `vite preview` behind Cloudflare Tunnel.
 */
function createGasProxyMiddleware() {
  return async (req, res) => {
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: false, error: 'Method Not Allowed' }));
      return;
    }

    let rawBody = '';
    req.on('data', (chunk) => {
      rawBody += chunk;
    });

    req.on('end', async () => {
      try {
        const { gasUrl, rpcPayload } = JSON.parse(rawBody || '{}');
        if (!gasUrl || !String(gasUrl).startsWith('https://script.google.com/macros/s/')) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              ok: false,
              status: 400,
              error: 'URL GAS tidak valid. Pastikan berformat https://script.google.com/macros/s/.../exec',
            })
          );
          return;
        }

        const upstreamResponse = await fetch(gasUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain;charset=utf-8',
            Accept: 'application/json',
          },
          body: JSON.stringify(rpcPayload),
          redirect: 'follow',
        });

        const contentType = upstreamResponse.headers.get('content-type') || '';
        const responseText = await upstreamResponse.text();

        // Check if Google Apps Script returned an HTML error or login page (403/401)
        if (
          upstreamResponse.status === 401 ||
          upstreamResponse.status === 403 ||
          upstreamResponse.url.includes('accounts.google.com') ||
          responseText.trim().startsWith('<!DOCTYPE html') ||
          responseText.trim().startsWith('<html')
        ) {
          const errorMatch = responseText.match(/class="errorMessage"[^>]*>([^<]+)</i);
          const extractedGasError = errorMatch ? errorMatch[1].trim() : null;

          let diagnosticMessage =
            'Akses ditolak oleh Google Apps Script (HTTP 403 Forbidden). ' +
            'Pastikan saat Deploy Web App di GAS: (1) Jalankan fungsi setupDatabaseSchema() lalu klik Allow/Izinkan, ' +
            '(2) Pilih Deploy > Manage deployments > Edit > New version, dan (3) Setel "Who has access" menjadi "Anyone" (Siapa saja).';

          if (extractedGasError) {
            diagnosticMessage = `Error dari Google Apps Script: "${extractedGasError}". Pastikan skrip dibuat dari Extensions > Apps Script di dalam Google Sheets dan sudah di-Authorize.`;
          }

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              ok: false,
              status: 403,
              error: diagnosticMessage,
            })
          );
          return;
        }

        if (contentType.includes('application/json') || responseText.trim().startsWith('{')) {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(responseText);
          return;
        }

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            ok: false,
            status: 502,
            error: `Respons tidak terduga dari GAS (Status ${upstreamResponse.status}). Pastikan URL diakhiri dengan /exec (bukan /dev).`,
          })
        );
      } catch (err) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            ok: false,
            status: 500,
            error: `Gagal menghubungi server GAS: ${err.message}`,
          })
        );
      }
    });
  };
}

function gasCorsProxyPlugin() {
  return {
    name: 'gas-cors-proxy',
    configureServer(server) {
      server.middlewares.use('/__gas_proxy__', createGasProxyMiddleware());
    },
    configurePreviewServer(server) {
      server.middlewares.use('/__gas_proxy__', createGasProxyMiddleware());
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), gasCorsProxyPlugin()],
  server: {
    port: 5173,
    host: true,
    // Wajib diaktifkan pada Vite 6 agar domain *.trycloudflare.com atau custom domain Cloudflare Tunnel tidak diblokir
    allowedHosts: true,
  },
  preview: {
    port: 4173,
    host: true,
    allowedHosts: true,
  },
});

// sumsub-id-and-liveness.js
import snsWebSdk from '@sumsub/websdk';

/**
 * Launches Sumsub WebSDK for the "id-and-liveness" flow.
 * @param {string} accessToken - access token obtained from your backend
 * @param {() => Promise<string>} refreshTokenFn - callback to fetch a fresh token
 * @param {string} containerSelector - CSS selector for the container (e.g. '#sumsub-websdk-container')
 */
export function launchIdAndLiveness(accessToken, refreshTokenFn, containerSelector) {
  const sdk = snsWebSdk
    .init(
      accessToken,
      // This callback should return a Promise resolving to a new token
      () => refreshTokenFn()
    )
    .withConf({
      lang: 'en',          // UI language
      uiConf: {
        customCssStr: `
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
          .button { background-color: #fbbf24 !important; color: #000 !important; }
        `
      }
    })
    .on('onError', (error) => {
      console.error('Sumsub SDK error:', error);
    })
    .onMessage((type, payload) => {
      console.log('Sumsub SDK message:', type, payload);
    })
    .build();

  // Mount and launch the SDK in the given container
  sdk.launch(containerSelector);
  return sdk;
}

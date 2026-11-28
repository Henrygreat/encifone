# Website chat installation

In **Communication Centre → EncifOne Website Chat**, choose **New widget**, then enter an internal widget name, public brand name, welcome message, privacy notice and each exact HTTPS origin where the widget should run. The scheme, host and port must match. Add both the apex domain and its www variant if both are used. Save and copy the installation snippet.

| Website platform | Installation point |
| --- | --- |
| Standard HTML | Paste the snippet before the closing body tag in the shared site template. |
| WordPress and WooCommerce | Use a trusted custom-code plugin or your child theme’s footer hook. Place the snippet in the footer and test each relevant page, including the storefront. |
| WPBakery | Add the snippet using a site-wide footer hook or a Raw HTML element where the role and site configuration allow scripts. |
| Elementor | Use site-wide Custom Code at the end of the body if available. A footer script through WordPress also works. |
| Shopify | Add the snippet before the closing body tag in the active theme layout. A storefront theme change may not apply to checkout surfaces. |
| React | Add the snippet once in the root HTML template or load the script once in the application shell. |
| Next.js | Load the script once with the framework’s script component, using the copied source and preserving the widget identifier as the data-widget attribute. |
| Google Tag Manager | Put the snippet in a Custom HTML tag triggered only on the allowed site hosts. Publish the container and check the site’s content security policy. |

Open the external website as an anonymous visitor, confirm that the launcher appears and exchange a test message with staff through Universal Inbox. Refresh widget settings to inspect the last detected origin and time. This indicates a successful configuration fetch and may lag by up to five minutes. It is not an ownership check. Disable individual widgets in their settings if they should stop accepting new messages.

If the launcher is missing, check the page’s exact origin, the widget’s enabled status and the copied public key. Verify that the website’s content security policy permits scripts and connections to the configured EncifOne origin. If using a CDN or cache, publish the current layout and retest in a private browser session. The widget uses the public origin set by `APP_URL`. Keep this origin consistent with your reverse proxy.

The current visitor workflow supports text conversations and uses a signed, expiring token stored in the current browser tab. File uploads, offline scheduling, transcripts, typing indicators and white-label options are open.

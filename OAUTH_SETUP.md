# Optional Gmail OAuth setup (v0.27)

Gmail Verified Header Mode is optional. A.E.G.I.S. continues to work in Standard Mode without it.

## This stable team build

Version 0.28.0 preserves the public manifest key that fixes the unpacked Chrome extension ID to:

`feblkjonnopmmcojjidcnakbpdpkmajh`

Every teammate loading this build receives that same ID, even from a different folder. The packaged public OAuth Client ID is registered for this exact Item ID; no client secret is used.

## What permission is requested?

Only:

`https://www.googleapis.com/auth/gmail.metadata`

Google describes this as access to message metadata such as labels and headers, **not the email body**. A.E.G.I.S. requests selected authentication headers and keeps only the SPF/DKIM/DMARC result summary. It does not store the original header or OAuth access token.

## One-time Google Cloud setup

1. Load this folder from `chrome://extensions` using **Load unpacked**.
2. Copy the extension **ID** shown on its card.
3. In Google Cloud Console, create or select a project named **A.E.G.I.S.**.
4. Enable the **Gmail API**.
5. Configure the OAuth consent screen:
   - App name: `A.E.G.I.S.`
   - Audience: External for personal Gmail testing, or Internal only when your college Google Workspace allows it.
   - Add your Gmail address under **Test users** while the app is in testing mode.
6. Create an OAuth client:
   - Application type: **Chrome Extension**
   - Item ID: paste the extension ID from step 2.
7. Confirm that the generated public Client ID matches the one packaged in `manifest.json`.
8. Reload A.E.G.I.S. at `chrome://extensions`, hard-refresh Gmail, then open **Settings → Gmail Verified Header Mode → Connect Gmail**.

## Important safety rules

- A Client ID is public configuration and may appear in the extension.
- Never paste a client secret, password, authorization code or OAuth token into the project or send one to another person.
- Always distribute a build containing the same manifest public key. Its folder name and location do not affect the stable extension ID.
- Before Chrome Web Store release, use the final Web Store extension ID and create the production OAuth client for that ID.
- Google may show an **unverified app** warning during private testing. Keep the project in Testing mode and add only your team's accounts as Test users.
- A college-managed Google account may block consent. Test first with a personal Gmail account.

## What the result means

The three message-level badges are Gmail's delivery-time results from a trusted `google.com` Authentication-Results header. They are stronger than DNS posture, but they are still **provider-reported results**. A.E.G.I.S. is not independently performing the full DKIM signature calculation.

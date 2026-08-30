# Optional Outlook OAuth setup (v0.28.5)

Outlook Verified Header Mode is optional. Standard Mode continues to scan Gmail and Outlook without a Microsoft login.

The configured team release already contains the public Microsoft Application (client) ID `a273c6f1-b230-4dbb-bce8-597a04491a25`. Teammates loading the packaged release do not need to edit the code or create another client ID.

## What this mode requests

A.E.G.I.S. requests these delegated scopes only:

- `openid`
- `profile`
- `Mail.ReadBasic`

`Mail.ReadBasic` excludes the message body, body preview and attachments. A.E.G.I.S. requests the currently open message's sender, Reply-To and `internetMessageHeaders`, parses them in memory, and saves only a small SPF/DKIM/DMARC result summary. If Outlook Web supplies an ID that Graph rejects, the extension first uses a 10-result subject search. If the personal-Outlook RequestBroker rejects that search, it may inspect at most 100 recent basic metadata records. Both routes apply exact subject/sender matching locally and continue only when the open message is unambiguous. It does not request `Mail.Read`, `offline_access`, a client secret or a refresh token.

Official references:

- [Microsoft Graph: Get message](https://learn.microsoft.com/en-us/graph/api/message-get?view=graph-rest-1.0)
- [Microsoft Graph permissions reference](https://learn.microsoft.com/en-us/graph/permissions-reference)

## Permanent extension redirect URI

The packaged public manifest key fixes the extension ID to:

`feblkjonnopmmcojjidcnakbpdpkmajh`

Register this exact redirect URI in Microsoft Entra:

`https://feblkjonnopmmcojjidcnakbpdpkmajh.chromiumapp.org/microsoft`

## Create the Microsoft Entra application

1. Open the [Microsoft Entra admin center](https://entra.microsoft.com/) and go to **Identity → Applications → App registrations**.
2. Select **New registration**.
3. Name it `AEGIS Outlook Verified Header Mode`.
4. Under supported account types, choose **Accounts in any organizational directory and personal Microsoft accounts** so college/work and Outlook.com test accounts can connect.
5. Finish registration and copy the **Application (client) ID** from the Overview page. This ID is public; do not create or share a client secret.
6. Open **Authentication → Add a platform → Single-page application**.
7. Add the exact redirect URI shown above and save.
8. Open **API permissions → Add a permission → Microsoft Graph → Delegated permissions**.
9. Add `Mail.ReadBasic`. Do not add `Mail.Read`, `Mail.ReadWrite`, `offline_access` or application permissions.
10. Confirm `lib/outlookHeaderAuth.js` contains the copied public Application (client) ID. The configured team release already contains it.
11. Reload A.E.G.I.S. at `chrome://extensions`, hard-refresh Outlook Web, then open **Settings → Outlook Verified Header Mode → Connect Outlook**.

## Session and disconnect behaviour

- The access token is kept only in `chrome.storage.session` and service-worker memory. It is not written to persistent local storage or included in reports.
- A.E.G.I.S. does not request a refresh token. After the browser/extension session ends, Outlook may ask you to reconnect.
- **Disconnect Outlook** clears A.E.G.I.S.'s local session token and disables verified mode. It does not claim to remove the Microsoft account's historical consent grant; that can be removed separately from the user's Microsoft account permissions page.
- Microsoft Graph traffic goes directly between the browser extension and Microsoft. There is no A.E.G.I.S. server in this flow.

## Team sharing

Share the complete project folder or ZIP. Because the manifest contains the permanent public key, every teammate should see extension ID `feblkjonnopmmcojjidcnakbpdpkmajh`. The same registered redirect URI and public Microsoft client ID will then work on each machine. Never include a private key, client secret, password, authorization code or OAuth token.

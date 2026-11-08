# Native acceptance instructions and status

Status: the owner-supplied controlling Dot report confirms the messaging tests below passed, including post-redeployment delivery. Do not repeat them merely because these instructions remain here. Negotiated MCP version and native subscription refresh/expiry/isolated unsubscribe were unavailable through exposed controls. Separate-account access and BotFather group-joining confirmation remain outstanding.

Use only synthetic test text. Preserve the active automation, its subscriptions, Site settings, and keys. Do not paste tokens, callback URLs/secrets, signed message references, or conversation content into installer reports. Report test labels and pass/fail instead. The owner has already confirmed new-message replies, edited-message replies, and the one-shot typing indicator.

## 1. Give this instruction to the controlling Dot

> Perform Dotagram acceptance using disposable synthetic messages in my configured Telegram DM. I authorize the test sends, replies, edits, deletes of your own test messages, and reaction changes described below. Preserve my automation and subscriptions. Do not automatically retry uncertain writes. If a native capability is unavailable, report it as unverified rather than inventing an API or callback endpoint.
>
> A. Verify the connection and inspect the available native catalog. Confirm MCP 2026-07-28, exactly five tools (telegram_get_connection_info, telegram_send_message, telegram_edit_message, telegram_delete_message, telegram_set_reaction), and two events (telegram.message.created, telegram.message.updated), where discovery metadata is accessible. Distinguish observed catalog data from documentation.
>
> B. When I send `DOTAGRAM CHECK A` in Telegram, send two distinct responses to that single incoming event, labeled `CHECK A FIRST` and `CHECK A SECOND`. Make both explicit replies to my source message. Keep the first send's signed reference in your own context for later tests. Report whether both sends and reply relationships are confirmed.
>
> C. After I confirm seeing both responses, edit your first response to `CHECK A EDITED` using its signed reference. Set a thumbs-up reaction on my original test message; after I confirm seeing it, clear the reaction. After I confirm the edited text, delete only your first bot-authored test response. Do not delete my incoming test message.
>
> D. Test rejection with a deliberately invalid signed reference such as `synthetic.invalid` in an edit or delete call: expect invalid_message_reference and no Telegram mutation. If you can safely construct a tampered copy of your own test reference in memory, confirm it is rejected too; never export the reference. Do not attempt to delete a real owner message as a positive test. Owner-authorship protections also have synthetic test coverage.
>
> E. For the rapid-message test below, check that each new/edit event has the correct synthetic text, distinct update/event identity, timestamps, and source/reply relationship when present. Accept out-of-order arrival. Confirm your outgoing test messages do not become incoming owner events or cause a loop.
>
> F. If native subscription controls are available, refresh the existing subscriptions using their existing native bindings and verify identity and granted expiry are preserved/extended appropriately. Test canonical unsubscribe only on a separate disposable native subscription whose identity is demonstrably different from both production subscriptions. If an isolated native binding cannot be created, leave unsubscribe unverified; do not unsubscribe the controlling automation or invent a callback URL. Remove only the disposable subscription after testing. Do not share callback credentials.
>
> Report each test as passed, failed, or unavailable. Do not treat policy blocks as Dotagram API failures.

## 2. In Telegram

1. Send `DOTAGRAM CHECK A` and confirm two distinct responses, each visibly linked as a reply to that message. This also verifies delivery after the installer's unchanged-version redeployment.
2. Follow the Dot's checkpoints: confirm the first bot message changes to `CHECK A EDITED`, the thumbs-up appears on your source message and disappears when cleared, and only the designated bot message is deleted.
3. Send `DOTAGRAM RAPID B` and `DOTAGRAM RAPID C` close together. Edit B to `DOTAGRAM RAPID B EDITED`. Reply to C with `DOTAGRAM REPLY D`. Ask the Dot to report receipt of all four events and correct reply linkage, without requiring arrival order.
4. Disable group joining for this bot in BotFather if still enabled. Have the Dot verify getMe/configuration through available supported controls; if its connection tool does not expose that flag, report your BotFather confirmation. No group needs to be created for acceptance.

## 3. Separate-account access check

This requires a genuinely different ChatGPT account, not forged headers or an incognito window signed in as the owner. Visit https://dotagram.paryllax.chatgpt.site/setup with that account: it may show its own bootstrap identity, but must not show the owner's configuration or connection details. If native plugin access is available to that account, attempt only discovery or telegram_get_connection_info: owner-only operations must be rejected. Do not share owner credentials or call write tools. If no second account is available, document this as an outstanding hosted check; synthetic owner-isolation tests have passed.

## Already covered without disruptive live testing

Local tests cover expiry, rotation, simultaneous deduplication claims, blocked-bot errors without subscription cancellation, unsupported contexts, callback retry/deadline failures, and interrupted Worker loss. Do not block the bot, rotate live keys, wait for a 25-hour/72-hour boundary, or create outage infrastructure merely to repeat these tests. Native renewal need not be demonstrated by waiting 72 hours.

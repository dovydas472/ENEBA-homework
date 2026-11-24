# Task 19 – Final audit against the assignment + last fixes

**Model:** Opus · **Effort:** high
The last code task before submission. No migration expected.

## 1. Branch
Standard workflow from `CLAUDE.md` (`task/19-final-audit`).

## 2. Fresh-eyes audit (do this FIRST, before any fix)
Start a **separate subagent** that has **not** seen our decisions. Give it only: the assignment text below, the repository, and the production URL `https://enehomeworkba.vercel.app`. Do **not** give it `ENEBA_CONTEXT`, the reports or `CLAUDE.md` decisions as justification. Ask it to act as a strict Eneba reviewer and produce a table: requirement (sentence by sentence) → met / partly / not met → evidence (page, file:line, request) → what a reviewer would criticise. It must actually use the live site (headless browser, desktop + phone) and the code. Put its table **verbatim** in the report, then your comments.

### The assignment (verbatim)
> - AI and agentic coding is strongly encouraged. Ask your agent to save a log of your conversations (full) which are required to submit. In case you use a non-agentic approach, please provide a link to the conversation.
> - We want to understand how you use AI.
> - You must be able to explain your code.
> - Shortcuts are allowed, specs are intentionally vague and open for interpretation - you decide the scope and you will have to justify it.
> - Please implement a marketplace web application in Eneba's style that matches eneba.com website, with the following parts:
>   - Store: A catalog where visitors can browse every product in the marketplace. They can narrow the list with filters (for example platform, region or price), change the order, and search by name.
>   - Homepage: The landing page is assembled from several different blocks, such as a banner, best sellers or deals. Each block gets its content from its own backend service or database, so the frontend only displays what it receives and nothing is hardcoded there.
>   - Search: Visitors can search for products by name from anywhere in the app and see the matching results. Search should cope with typos and partial names where it can.
>   - Product page: The page for a single product, showing its details and the offers from several sellers, so a buyer can compare and choose.
>   - Checkout: A buyer can put products in a cart, pay, and receive the digital key they bought. Payment can be simulated or use a payment provider's test mode. No real money is involved.
>   - Authentication: Visitors can create an account and sign in. Some parts of the app, such as checkout and order history, are only for signed-in users.
>   - Eneba styling: The app should look and feel like Eneba. Colors, typography, spacing and components follow the design reference.
> - Flow: a purchase starts from the homepage or from search → product page → cart → checkout (sign-in required) → payment → order and key. Eneba styling applies to every screen.

## 3. Known fixes (owner decisions – do these regardless of the audit)
1. **"Register" in the desktop header** next to "Sign in", like Eneba ("Sign in | Register"), both keeping the `next` return path. Phone: already in the menu drawer – check it. Tests.
2. **README – honesty about the first planning chat:** in "How this project was built with AI", add: before this repository and the planning chat, a short earlier conversation (which also covered the owner's personal job search, so it is not shared) chose the stack and hosting; its decisions were written into the first version of the planning context that starts the shared planning chat. Everything after that is in the shared planning chat and in `ai-logs/`.
3. **README – the planning chat link:** replace `<SHARE_LINK>` with: `https://claude.ai/share/OWNER_FILLS_IN` – **ask the owner for the real link in the chat before pushing** this change, do not invent it.
4. **Sign-in sanity check on production** (the owner had trouble signing in): register a new account with a fresh e-mail, sign out, sign in with the same e-mail and password, sign out; then a wrong password → the generic error. Report exactly what happened. If anything fails, find the cause before changing code.

## 4. Audit findings
For each finding of the subagent: fix it if it is small and clearly right (list it), otherwise **do not change it** – put it under "Open questions" with a recommendation (fix / document in README "Scope and shortcuts" / ignore, and why). No new features without the owner's answer.

## 5. Verify
Standard checks; production smoke test again after the Preview (sign-in/register, search, store, product, cart, checkout, keys, orders – desktop and phone); axe 0 on changed pages.

## Report
As defined in `CLAUDE.md` (incl. the subagent's verbatim table, Self-review). Export the session log at the end and commit it on this branch.

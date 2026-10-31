# E-Commerce Platform – Technical Project Plan

**Version:** 2.1  
**Scope:** Single-owner e-commerce, WhatsApp commerce, AI-assisted sales and DevDraft payments  
**Status:** Proposed implementation plan

---

## 1. Project Overview

Build a secure, straightforward e-commerce platform for one business owner. The platform will provide:

1. A public online store where customers can browse products, place orders and pay.
2. A WhatsApp sales channel where customers can enquire and place orders through conversations.
3. An AI sales assistant powered by Google Gemini that can understand text, voice notes and images, respond naturally within owner-defined rules, and guide customers through ordering.
4. One administration dashboard for products, stock, customers, conversations, orders, payments and sales.

The website and WhatsApp channel must use the same backend, product catalogue, inventory, customer records, order system and payment records. This ensures that stock and order information remain consistent regardless of the sales channel.

**Business model:** Single owner; not a marketplace or multi-vendor platform.

**Customer account requirement:** Customers do not need to register or create passwords. At checkout or during a WhatsApp order, collect their full name and phone number. A delivery address is optional unless delivery is requested and the business needs it to fulfil the order.

---

## 2. User Types and Access

### 2.1 Business owner / administrator

The owner has access to the administration dashboard and can:

- Manage products, categories, prices and stock.
- View and manage all orders.
- Manage customer records.
- Connect and manage the business WhatsApp account.
- Read and reply to WhatsApp conversations.
- Enable, disable and configure the AI assistant.
- Take over conversations from the AI.
- View payments, sales reports and activity logs.
- Configure business details, operating hours, delivery and collection policies.

The initial release supports one owner account. The design may allow additional staff roles later, but multi-user staff management is not part of the initial scope.

### 2.2 Customers

Customers can:

- Browse the public storefront without signing in.
- Search and view products.
- Add products to a cart and check out.
- Contact the business through WhatsApp.
- Make enquiries and place orders through the AI-assisted WhatsApp conversation.
- Receive an order summary and payment link.
- Receive order and payment updates.

Required customer details:

| Field | Requirement |
|---|---|
| Full name | Required |
| Phone number | Required |
| Delivery address | Optional; required by the business only when necessary for delivery |

---

## 3. Core E-Commerce Features

### 3.1 Administrator authentication

- Secure administrator login.
- Password hashing using a modern password-hashing algorithm.
- Secure, HTTP-only session cookies.
- Session expiry and logout.
- Password reset process.
- Rate limiting and protection against repeated login attempts.
- Authorization checks on every protected backend endpoint.

Customer accounts are not required for the initial release.

### 3.2 Product and category management

The owner can:

- Create, edit, archive and delete products.
- Upload one or more product images.
- Set product name, description, SKU and category.
- Set selling price and, where required, a comparison/original price.
- Mark products as active, inactive or unavailable.
- Search and filter the catalogue.
- View product sales and stock information.

Products should have stable internal IDs. AI responses and orders must refer to product IDs, not rely on product names alone.

### 3.3 Inventory and stock management

- Record available stock quantities.
- Adjust stock manually with a reason.
- Track stock movements and adjustment history.
- Display low-stock warnings.
- Prevent customers from ordering unavailable products.
- Keep website and WhatsApp stock availability synchronized.
- Use database transactions and concurrency controls to prevent overselling.
- Reserve stock for confirmed checkout/order flows where appropriate, with an expiry policy for unpaid orders.

Stock must not be deducted merely because a customer asks about a product or starts a conversation. The system should reserve or deduct stock only according to the defined order and payment policy.

### 3.4 Public storefront

- Responsive product catalogue.
- Product categories.
- Product detail pages with images, descriptions and prices.
- Search and basic filtering.
- Shopping cart.
- Quantity editing and item removal.
- Checkout without customer registration.
- Clear order summary before payment.

### 3.5 Website checkout

Collect the customer's full name and phone number. The delivery address is optional for collection or where it is not needed; if the customer selects delivery, collect the address and any other minimum delivery details configured by the owner.

The backend must recalculate prices and totals from trusted database records. It must never trust prices, discounts, delivery fees or totals submitted by the browser.

### 3.6 Order management

The owner can:

- View all orders from both sales channels.
- Filter by order date, status and sales channel.
- View customer details, order items, quantities and totals.
- Update fulfilment status.
- View payment status and transaction references.
- Cancel orders under defined rules.
- Review the related WhatsApp conversation when an order originated from WhatsApp.

Suggested order statuses:

- `DRAFT`
- `PENDING_CONFIRMATION`
- `PENDING_PAYMENT`
- `PAID`
- `PROCESSING`
- `READY_FOR_COLLECTION`
- `DISPATCHED`
- `COMPLETED`
- `CANCELLED`
- `EXPIRED`

Payment status and fulfilment status should be separate fields. For example, an order can be `PAID` but still `PROCESSING`.

### 3.7 Sales and reporting

Dashboard metrics:

- Total paid sales.
- Number of orders.
- Paid, unpaid and cancelled orders.
- Sales by date range.
- Best-selling products.
- Current stock and low-stock products.
- Sales by channel: website or WhatsApp.

Provide filters for today, this week, this month and a custom date range.

Only verified successful payments should count as paid revenue.

---

## 4. WhatsApp Integration – whatsapp-web.js

### 4.1 Purpose

Integrate [`whatsapp-web.js`](https://github.com/wwebjs/whatsapp-web.js), a Node.js library that interacts with WhatsApp Web through a browser automation session, to support WhatsApp conversations as an additional sales channel.

Official project resources:

- GitHub: <https://github.com/wwebjs/whatsapp-web.js>
- API documentation: <https://docs.wwebjs.dev/>

The integration should be implemented as a dedicated WhatsApp service, separate from the main web application and API process. The service maintains the browser session and communicates with the backend through authenticated internal APIs or a message queue.

**Production warning:** `whatsapp-web.js` is an unofficial WhatsApp Web integration. It is not endorsed by WhatsApp/Meta, may break when WhatsApp Web changes, and use may expose the account to restrictions or blocking. The owner must understand and accept this risk before connecting a business number. Keep the messaging provider behind an adapter so the platform can migrate to the official WhatsApp Business Platform if required.

### 4.2 WhatsApp connection management

Admin dashboard features:

- Display a QR code to link the business WhatsApp account.
- Display connection state and connected number when available.
- Show authentication, disconnection and reconnect status.
- Persist the authenticated session securely.
- Support deliberate disconnect and reconnect.
- Report session and browser errors.
- Avoid displaying or exposing session credentials.

The service should use the library's supported authentication strategy, such as `LocalAuth`, with persistent storage. Session files must be protected, excluded from source control and backed up only where appropriate and securely encrypted. The service should not require a new QR scan after every normal restart, subject to WhatsApp session validity.

### 4.3 WhatsApp inbox

Build an inbox in the administrator dashboard with:

- Conversation list.
- Customer name and phone number.
- Latest message and timestamp.
- Unread indicators.
- Search and filtering.
- Incoming and outgoing messages.
- Supported image, audio and document previews.
- Message delivery/error state where available.
- Conversation history.
- Reply composer.
- Customer details and order history.
- AI/manual handling indicator.

Use real-time updates, for example through Socket.IO, so incoming messages and outgoing replies appear without refreshing the page.

The inbox should reflect messages received and sent through the connected WhatsApp account. It should not be treated as a separate messaging channel.

### 4.4 Manual replies and human takeover

The owner can open any conversation and reply from the dashboard.

Each conversation must have an explicit handling state, for example:

- `AI_AUTO`: AI may respond within configured permissions.
- `AI_SUGGEST`: AI may draft replies, but owner approval is required.
- `HUMAN`: AI sending is paused; owner handles the conversation.
- `PAUSED`: Automated replies are disabled.

When the owner takes over:

1. Mark the conversation as `HUMAN`.
2. Stop queued AI replies for that conversation.
3. Prevent any in-progress AI response from being sent after takeover.
4. Allow the owner to send messages from the inbox.
5. Resume AI only when the owner explicitly releases the conversation or an owner-configured takeover timeout expires.

A timeout must not silently override a manual pause if the owner has chosen an indefinite takeover.

---

## 5. Gemini AI Sales Assistant

### 5.1 Purpose

Integrate the [Google Gemini API](https://ai.google.dev/gemini-api/docs) as the conversational intelligence layer.

The assistant should:

- Understand customer intent and conversation context.
- Respond naturally and helpfully.
- Answer product, price and stock questions using live backend data.
- Ask follow-up questions to clarify requests.
- Guide customers through creating an order.
- Understand supported incoming voice notes and images.
- Combine media understanding with accompanying text/captions and previous conversation context.
- Escalate uncertain, sensitive or exceptional cases to the owner.

Gemini must not have direct database credentials or unrestricted database access. It should request narrowly defined backend functions, and the backend must validate and execute each operation.

### 5.2 Natural conversation with controlled response formats

The AI must be able to follow strict business rules without sounding robotic.

The owner should be able to configure response styles, including:

- **Natural conversational:** Friendly, human-sounding responses that acknowledge what the customer said and continue the conversation.
- **Concise:** Short, direct responses for simple questions.
- **Structured:** Strictly formatted responses for order summaries, prices, payment instructions, delivery details and other information where consistency matters.
- **Preset responses:** Exact owner-approved wording for greetings, business hours, location, delivery policies, payment instructions and other frequently asked questions.

The system must distinguish between *response format* and *conversation behaviour*:

- Strict formatting applies to the information that must be precise.
- Natural conversational behaviour applies to the way the assistant acknowledges the customer, asks questions and moves the conversation forward.
- The assistant should not force every message into a template.
- The assistant should not add unnecessary greetings or repeat information already established.
- The assistant should ask one clear follow-up question at a time where possible.
- It should remember relevant details already provided in the current conversation.
- It should not ask the customer to repeat their name, phone number, product choice or delivery details if those details are already known and reliable.

For example, the assistant may respond conversationally to a product enquiry, but use a strict, consistent order-summary format before asking the customer to confirm an order.

### 5.3 Owner-configurable AI rules

Provide an AI settings page with:

| Setting | Options / behaviour |
|---|---|
| AI master switch | Enabled / disabled |
| Operating mode | Manual / suggestions / automatic |
| Response style | Conversational / concise / structured / preset |
| Product enquiries | Enabled / disabled |
| Stock enquiries | Enabled / disabled |
| Order assistance | Enabled / disabled |
| Draft order creation | Enabled / disabled |
| Automatic payment-link generation | Enabled / disabled |
| Voice-note understanding | Enabled / disabled |
| Image understanding | Enabled / disabled |
| Business hours | Configurable schedule |
| Response language | Configurable |
| Tone | Professional / friendly / casual |
| Confidence threshold | Owner-configurable policy |
| Human takeover | Per conversation and global pause |
| Escalation rules | Configurable topics and conditions |

Recommended operating modes:

1. **Manual:** No AI messages are sent.
2. **Suggestions:** Gemini drafts replies; the owner approves before sending.
3. **Automatic:** Gemini may send replies within the owner's configured rules.

The owner should be able to change a conversation's mode independently of the global setting.

### 5.4 Multimodal understanding: text, voice notes and images

The AI must understand more than plain text. Customers may send a voice note, a picture, a caption, or a combination of these in the same conversation.

#### Incoming text

- Receive and store the message.
- Associate it with the correct WhatsApp conversation.
- Retrieve relevant recent conversation context.
- Send the text and relevant context to Gemini.
- Generate a response or request an approved backend action.

#### Incoming voice notes

When a customer sends a voice note:

1. Detect the incoming audio message.
2. Retrieve the media using the WhatsApp integration.
3. Validate the media type and size.
4. Download it to temporary, access-controlled storage.
5. Convert or prepare it into an audio format supported by the selected Gemini model if necessary.
6. Send the audio to Gemini for transcription and interpretation.
7. Include the customer's accompanying text/caption, if any.
8. Include relevant conversation history and business context.
9. Interpret the customer's complete intent.
10. Generate a natural response or continue the order workflow.
11. Delete temporary media according to the configured retention policy.

The system should understand the meaning of the voice note, not merely produce a transcript. For example, if the customer says, "Can I get three of the smaller ones you showed me?", the AI should use previous messages and product references to identify what "the smaller ones" means. If it cannot identify the product confidently, it should ask a clarifying question.

#### Incoming images

When a customer sends a picture:

1. Detect the image message.
2. Retrieve and validate the media.
3. Extract any caption or accompanying text.
4. Send the image, caption and relevant conversation context to Gemini's supported image-understanding capability.
5. Ask Gemini to interpret the image in the context of the customer's request.
6. Use the product catalogue to identify possible matching products where relevant.
7. Ask for clarification if the image is ambiguous.

Examples:

- A customer sends a product photo and asks, "Do you have this?"
- A customer sends a screenshot of a product and asks for its price.
- A customer sends a picture and says, "I want two of these."
- A customer sends a picture of a product variation and asks whether it is available.

The AI must not claim that an image definitely matches a catalogue product unless the match is sufficiently supported. It should ask the customer to confirm when necessary.

#### Combining text, captions, media and conversation history

For every multimodal message, the AI request should contain the relevant available inputs together:

- Current text message.
- Image or audio content.
- Caption or media description.
- Relevant previous messages.
- Current conversation state.
- Relevant business policies.
- Relevant product and stock information retrieved from the backend.

This is essential. A voice note or image should not be interpreted in isolation when the surrounding conversation changes its meaning.

For example, a customer might send a picture with the caption "I need two of these" after previously discussing a particular product. The assistant should consider both the image and the earlier discussion before replying.

**Implementation note:** Gemini model capabilities, supported audio/image formats, payload limits and pricing can change. Select a currently supported Gemini model and verify its current API documentation before implementation. Do not assume every WhatsApp media format can be passed directly to Gemini; convert or prepare media where required.

### 5.5 Conversation memory and context

The AI should maintain useful context throughout each customer conversation.

Store:

- Conversation identifier.
- Customer identifier.
- Recent message history.
- Relevant product references.
- Current order-draft state.
- Customer details already provided.
- Current AI/manual handling state.
- Pending question or confirmation.
- Relevant tool/function results.

Use a bounded conversation context so requests do not grow indefinitely. Older messages can be summarized when necessary, while preserving important order details and unresolved questions.

The assistant must distinguish between:

- Information explicitly provided by the customer.
- Information retrieved from the business database.
- AI-generated interpretations or assumptions.

AI interpretations must never be treated as verified customer details without confirmation where accuracy matters.

### 5.6 AI safety and response boundaries

The assistant must:

- Never invent product prices, stock quantities, delivery fees or business policies.
- Never promise a product is available without checking live stock.
- Never claim payment has succeeded based on a screenshot or customer statement alone.
- Never mark an order as paid.
- Never issue unapproved discounts or change prices.
- Never send a payment link for an unconfirmed order.
- Never expose internal system information, API keys or private customer records.
- Escalate complaints, refunds, disputes, unclear requests and unusual situations according to owner settings.
- Avoid sending duplicate or conflicting responses.
- Respect human takeover immediately.
- Avoid sending messages when the conversation is paused or the owner has disabled automation.

If the AI is uncertain, it should ask a natural clarifying question or hand the conversation to the owner.

---

## 6. WhatsApp Order Automation

### 6.1 Order-taking objective

The AI should be able to turn a customer conversation into a valid order using the same product and inventory system used by the website.

The AI acts as a sales assistant, not as the authority for prices, stock or payment status.

### 6.2 Order conversation workflow

1. Understand the customer's request.
2. Search the product catalogue.
3. Identify the intended product and any variation.
4. Retrieve the current price from the backend.
5. Check available stock.
6. Ask for quantity and any missing product details.
7. Ask for the customer's full name if not already known.
8. Confirm the customer's WhatsApp phone number or ask for a preferred contact number where necessary.
9. Ask whether the customer wants delivery or collection, if the business supports both.
10. If delivery is selected, collect the required address and calculate the configured delivery fee.
11. Calculate the subtotal, delivery fee, discounts where authorized, and final total.
12. Present a clear order summary.
13. Ask the customer to explicitly confirm the order.
14. Create the order through a backend function.
15. Generate the DevDraft payment link for the confirmed order.
16. Send the payment link and order reference through WhatsApp.
17. Monitor payment confirmation through DevDraft's verified notification mechanism.
18. Update the order and inventory according to the payment and reservation policy.
19. Notify the customer and owner of the verified result.

### 6.3 Example conversation

**Customer:**  
Hi, I would like two wireless headphones.

**AI assistant:**  
Certainly! We have wireless headphones available at K350 each. Would you like me to prepare an order for two?

**Customer:**  
Yes, please.

**AI assistant:**  
Great. Would you prefer delivery or collection?

**Customer:**  
Delivery.

**AI assistant:**  
No problem. Could you share your delivery address?

**Customer:**  
Woodlands, Lusaka.

**AI assistant:**  
Thank you. I have the delivery location. May I have your full name for the order?

**Customer:**  
Edward Phiri.

**AI assistant:**  
Perfect. Here is your order summary:

| Item | Quantity | Amount |
|---|---:|---:|
| Wireless Headphones | 2 | K700 |
| Delivery | 1 | K50 |
| **Total** | | **K750** |

Would you like to proceed with this order?

**Customer:**  
Yes.

**AI assistant:**  
Thank you! Your order has been created.

Order reference: `ORD-00125`

You can review and pay for your order using this secure payment link:

`[Actual DevDraft payment URL returned by the API]`

We will confirm your order once your payment has been verified.

*All products, prices and fees above are illustrative.*

### 6.4 Order rules

- Do not create a confirmed order until the customer has explicitly agreed to the displayed items, quantities and total.
- A draft order can be maintained while the AI asks follow-up questions.
- Revalidate stock and price immediately before order confirmation.
- Do not let Gemini submit arbitrary prices or totals.
- Use a database transaction to create the order and its items.
- Generate payment links only for valid, confirmed orders.
- Do not deduct stock twice.
- Expire abandoned drafts and unpaid orders according to owner-configured rules.
- If stock changes before confirmation, explain the change and ask the customer to approve the revised order.

### 6.5 Backend functions available to Gemini

Gemini should use a controlled set of function calls:

| Function | Responsibility |
|---|---|
| `search_products` | Find products by name, description, category or relevant terms. |
| `get_product_details` | Retrieve verified product information and price. |
| `check_stock` | Check current available quantities. |
| `get_product_variants` | Retrieve available sizes, colours or other variations. |
| `get_business_policy` | Retrieve delivery, collection, opening hours and other policies. |
| `calculate_order` | Calculate the order total using trusted prices and fees. |
| `create_draft_order` | Save an incomplete order draft. |
| `update_draft_order` | Update draft items and customer details. |
| `confirm_order` | Validate and confirm a customer-approved order. |
| `generate_payment_link` | Request a DevDraft payment link for the confirmed order. |
| `get_order_status` | Retrieve the current order and payment status. |
| `handover_to_owner` | Transfer the conversation to the owner. |

All function calls must be validated by the backend. Gemini must not have direct SQL access or permission to bypass business rules.

---

## 7. DevDraft Payment Integration

### 7.1 Documentation and references

Use the DevDraft API documentation as the source of truth:

- Payment link creation: <https://exciting-quinoa-nsuar.apidocumentation.com/guide/payment-links/create-payment-link>
- Webhooks: <https://exciting-quinoa-nsuar.apidocumentation.com/guide/webhooks>

The integration must be checked against the current documentation and the actual credentials/account configuration before implementation.

### 7.2 Payment-link creation

The documented payment-link operation uses:

```http
POST /api/v0/payment-links
```

The documented authentication headers include:

```http
x-client-key: YOUR_CLIENT_KEY
x-client-secret: YOUR_CLIENT_SECRET
idempotency-key: UNIQUE_UUID
Content-Type: application/json
```

The payment-link request documentation describes fields including:

- `title`
- `url`
- `linkType`
- `amount`, where applicable
- `currency`
- `recurringType`
- `description`
- Optional customer and address collection settings

For this platform:

- Use a one-time payment link.
- Use the exact total calculated and approved by the backend.
- Include the internal order reference in the title or description.
- Use a unique idempotency key for the payment-link creation operation.
- Store the provider response and payment URL against the internal order.
- Send the actual customer-facing URL returned or confirmed by DevDraft.

Do not construct a payment URL from an undocumented slug pattern.

### 7.3 Payment workflow

1. Customer confirms the order.
2. Backend validates the order and final amount.
3. Backend creates or confirms the internal order.
4. Backend requests a DevDraft payment link.
5. Backend stores the payment-link response and reference.
6. WhatsApp sends the payment URL to the customer.
7. Customer completes payment on the provider's payment page.
8. DevDraft sends a webhook notification.
9. Backend verifies the webhook and matches it to the internal order.
10. Backend updates payment status.
11. Backend updates stock and fulfilment state according to the configured policy.
12. Customer and owner receive a payment confirmation.

Creating a payment link is not proof of payment. A customer message or screenshot is not proof of payment either.

### 7.4 Webhooks and verification

Use the webhook registration and verification process described in the DevDraft documentation.

The implementation should:

- Register the required payment events.
- Store webhook configuration securely.
- Verify the documented signature using the webhook signing secret.
- Validate the original request body according to the provider's signature procedure.
- Match the event to a known internal payment and order.
- Reject or safely ignore invalid and duplicate events.
- Record event IDs and processing outcomes.
- Support retry-safe processing.
- Reconcile payment status through the provider's supported API if a webhook is delayed or missed.

The documented examples include payment events such as `payment.completed` and `payment.failed`. Confirm the exact event names and payload fields against the current account/API documentation.

### 7.5 Items to confirm with DevDraft before production

The published documentation and examples need to be reconciled before deployment:

1. Confirm the correct production API base URL. The documentation/examples have referenced different hostnames.
2. Confirm whether ZMW is supported for the merchant's account and payment method. The published payment-link guide has listed currencies such as `usdc` and `eurc`; this does not establish ZMW support.
3. Confirm the exact customer-facing payment URL returned by the API.
4. Confirm the payment-link response fields and how the link maps to a completed payment.
5. Confirm webhook signature algorithm, header format, event payload and retry behaviour.
6. Confirm whether payment status can be queried through a separate API endpoint.
7. Confirm fees, settlement currency, refunds and transaction limits.

Do not advertise Kwacha payments or implement a guessed production URL until these items have been confirmed.

---

## 8. Admin Dashboard Structure

Suggested navigation:

1. Dashboard
2. Products
3. Categories
4. Inventory / Stock
5. Orders
6. WhatsApp Inbox
7. AI Assistant
8. Customers
9. Payments
10. Sales & Reports
11. Integrations
12. Settings
13. Logout

### 8.1 WhatsApp inbox layout

Use a three-panel layout:

**Conversation list**
- Customer name and number.
- Latest message.
- Last activity.
- Unread count.
- AI/manual status.
- Order status indicator.

**Conversation view**
- Full message history.
- Text, image, audio and document previews where supported.
- Message timestamps.
- Reply composer.
- AI-generated draft indicator.
- Send and takeover controls.

**Customer and order panel**
- Customer name and phone number.
- Delivery details where supplied.
- Previous orders.
- Current draft order.
- Current order and payment status.
- AI handling state.

### 8.2 AI activity and audit log

The owner should be able to inspect:

- Incoming customer message.
- Whether the message contained text, image or audio.
- AI interpretation or concise summary.
- Generated response.
- Whether it was suggested, approved or automatically sent.
- Backend function calls and results.
- Order changes.
- Payment-link creation events.
- Human takeover and release events.
- Errors and escalations.

Avoid retaining unnecessary copies of sensitive audio or image media. Store only what is needed for business operations and the configured retention period.

---

## 9. Database Structure

Use PostgreSQL with a relational schema.

| Table | Purpose |
|---|---|
| `users` | Administrator accounts. |
| `products` | Product catalogue. |
| `categories` | Product categories. |
| `product_images` | Product image metadata and storage references. |
| `inventory` | Current stock quantities. |
| `stock_movements` | Stock adjustments and history. |
| `customers` | Customer names, phone numbers and optional details. |
| `orders` | Orders from website and WhatsApp. |
| `order_items` | Product, quantity and price snapshots for each order. |
| `payments` | DevDraft payment links, references and status. |
| `conversations` | WhatsApp customer conversations. |
| `messages` | Incoming and outgoing messages and media metadata. |
| `conversation_controls` | AI/manual/paused state and takeover metadata. |
| `ai_settings` | Owner-defined AI modes, permissions and rules. |
| `ai_activity_logs` | AI decisions, tool calls and response outcomes. |
| `integrations` | WhatsApp and DevDraft connection metadata. |
| `webhook_events` | Received provider events and processing status. |

### 9.1 Important data rules

- Every order has a channel: `WEBSITE` or `WHATSAPP`.
- Customer identity should be matched using a normalized phone number, with appropriate country-code handling.
- Store a product price snapshot in each order item.
- Every payment references an internal order.
- Every WhatsApp message belongs to a conversation.
- Store provider message IDs to prevent duplicate message processing.
- Store webhook event IDs to prevent duplicate payment processing.
- Use database transactions for order confirmation, payment updates and stock movements.
- Keep payment state separate from fulfilment state.
- Keep AI conversation state separate from order state.

---

## 10. Proposed Technical Architecture

### 10.1 Technology stack

| Component | Recommended technology |
|---|---|
| Frontend | Next.js |
| Backend | Node.js with NestJS |
| Database | PostgreSQL |
| ORM | Prisma |
| WhatsApp integration | whatsapp-web.js and Puppeteer |
| AI | Google Gemini API |
| Payments | DevDraft REST API |
| Real-time dashboard updates | Socket.IO |
| Background jobs | Redis and BullMQ |
| Product/media storage | S3-compatible object storage |
| Authentication | Secure administrator sessions |
| Deployment | Persistent application hosting with secure secrets management |

### 10.2 Architecture principles

- Keep the public storefront and admin dashboard in one frontend application.
- Keep business logic in the backend.
- Run WhatsApp Web.js in a dedicated persistent service.
- Use a queue for incoming message processing and AI tasks.
- Keep Gemini and DevDraft API keys on the server only.
- Use a shared database for both sales channels.
- Use real-time events to update the admin inbox and order dashboard.
- Keep integrations behind service interfaces so providers can be replaced.
- Use idempotency and retry-safe processing for orders, messages and payments.

### 10.3 High-level system flow

```text
CUSTOMER
   |
   +--------------------+
   |                    |
WEBSITE              WHATSAPP
   |                    |
   |               WhatsApp Service
   |                    |
   +---------+----------+
             |
        BACKEND API
             |
   +---------+------------------+
   |             |              |
PRODUCTS      ORDERS         CUSTOMERS
   |             |              |
   +-------------+--------------+
                 |
             DATABASE
                 |
        +--------+---------+
        |                  |
    GEMINI AI          DEVDRAFT
        |                  |
 Text / Audio /       Payment Links
 Image Understanding     Webhooks
        |                  |
        +--------+---------+
                 |
          ADMIN DASHBOARD
```

---

## 11. Security, Privacy and Reliability

- Protect administrator routes and API operations.
- Hash passwords securely.
- Store secrets in environment variables or a secrets manager.
- Never expose API credentials to the browser or Gemini prompts.
- Encrypt sensitive integration/session data at rest where supported.
- Restrict access to WhatsApp session files.
- Validate uploaded media type and size.
- Use temporary media storage and retention limits.
- Apply rate limits to public and integration endpoints.
- Verify DevDraft webhook signatures.
- Use idempotency for payment and order operations.
- Prevent duplicate AI responses and message processing.
- Log important actions without unnecessarily logging secrets or sensitive message content.
- Back up the database and test restoration.
- Monitor WhatsApp connection state, queue failures and payment webhook failures.
- Provide a global AI pause switch.
- Provide immediate per-conversation human takeover.
- Establish a customer privacy notice explaining the use of AI and processing of messages/media.

The business owner must ensure that the chosen WhatsApp integration and customer-data processing approach comply with applicable WhatsApp terms and privacy requirements.

---

## 12. Development Phases

| Phase | Deliverable |
|---|---|
| 1 | Project setup, database, administrator authentication and application structure. |
| 2 | Products, categories, inventory and stock movement management. |
| 3 | Public storefront, shopping cart and checkout. |
| 4 | Orders, DevDraft payment links, webhooks and payment verification. |
| 5 | WhatsApp connection, session management, inbox and manual replies. |
| 6 | Gemini integration, text/audio/image understanding and conversation context. |
| 7 | AI guard rules, owner takeover and automated order workflow. |
| 8 | Sales reports, audit logs, security testing and deployment. |

Each phase should be tested before the next is considered complete.

---

## 13. Acceptance Criteria

The first production-ready release should satisfy the following:

### E-commerce

- Owner can log in securely.
- Owner can create and manage products.
- Stock quantities are maintained correctly.
- Public customers can browse and order without accounts.
- Checkout requires name and phone number.
- Address is collected when needed for delivery.
- Website orders are recorded correctly.

### WhatsApp

- Owner can connect the intended WhatsApp account.
- The service can receive and send supported messages.
- Conversations appear in the admin inbox.
- Owner can reply from the dashboard.
- Owner takeover stops automated replies.
- Message processing does not create duplicate replies or orders.

### AI

- AI can answer product questions using live catalogue data.
- AI can check stock through backend functions.
- AI can interpret incoming voice notes.
- AI can interpret incoming images and their captions.
- AI can combine media, text and relevant conversation history.
- AI maintains useful context across follow-up messages.
- AI follows the configured response style and business rules.
- AI asks for clarification when uncertain.
- AI can prepare and confirm orders through the controlled workflow.
- Owner can disable or take over AI conversations.

### Payments and orders

- Customer must confirm the order before payment-link creation.
- Payment link is generated through the documented DevDraft API.
- Actual payment URL is sent to the customer.
- Payment is confirmed only through a verified provider notification or supported verification mechanism.
- Duplicate payment notifications do not duplicate stock deductions.
- Website and WhatsApp orders use the same stock and order system.

---

## 14. Initial Scope Exclusions

Keep the first release focused. Exclude:

- Multiple vendors or sellers.
- Customer registration and password accounts.
- Loyalty points and reward programmes.
- Complex courier integrations.
- Advanced accounting.
- Subscription billing.
- Multiple warehouses.
- Advanced staff permissions.
- Unrestricted AI purchasing or spending authority.

These can be considered after the core system is stable.

---

## 15. Decisions to Confirm Before Implementation

The plan can proceed using the following proposed defaults, but these details should be confirmed before production configuration.

| Question | Proposed default |
|---|---|
| WhatsApp integration | Start with whatsapp-web.js only if the owner accepts its unofficial-integration and account-restriction risks; keep a provider adapter for migration. |
| Payment currency | Confirm ZMW support and settlement arrangements with DevDraft before launch. |
| Delivery pricing | Owner-configured flat fee initially; allow collection with no delivery fee. |
| AI mode | Suggestions during testing; automatic responses enabled only after the owner approves the behaviour. |
| AI order authority | AI can prepare drafts; backend confirms only after explicit customer approval. |
| Voice and image retention | Process temporarily and delete media after processing unless the owner configures a justified retention period. |
| Customer language | Owner-configurable; begin with the business's selected primary language and allow natural language matching where supported. |
| Business hours | Owner-configured; AI can use an approved after-hours response. |

### Questions for final configuration

1. **WhatsApp account:** Will the owner connect an existing personal WhatsApp account, a WhatsApp Business app account, or a dedicated business number? Confirm compatibility and risk before choosing the connection approach.
2. **Delivery:** Should delivery charges be a single flat fee, depend on delivery area, or be entered manually by the owner?
3. **AI autonomy:** Should AI be allowed to send payment links automatically after customer confirmation, or should the owner approve each link during the initial rollout?
4. **Languages:** Which languages should the assistant support at launch?
5. **Currency:** Is the business selling in ZMW, or is another currency acceptable if that is what the DevDraft account supports?

---

## 16. Final Objective

Deliver a lightweight, secure, single-owner commerce platform that combines a traditional online store with WhatsApp-based sales and a configurable Gemini AI assistant.

Customers should be able to communicate naturally with the business, send text messages, voice notes or images, ask about products and availability, and complete an order through a guided conversation.

The AI should respond naturally while respecting strict business rules and structured formats wherever accuracy matters. It should use live product and stock information, ask relevant follow-up questions, present a clear order summary, obtain the customer's confirmation and send a real DevDraft payment link.

The owner remains in control at all times through the administration dashboard, AI settings, activity logs and immediate human takeover.

**Core principle:** One business, one product catalogue, one inventory, one order system and one payment record — with the website and WhatsApp operating as two connected sales channels.

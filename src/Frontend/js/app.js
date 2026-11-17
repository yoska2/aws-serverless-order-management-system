// OrderFlow frontend
// Uses one plain JavaScript file to keep initialization simple and reliable.

const API_BASE_URL =
  "https://qr68bs0wwc.execute-api.us-east-1.amazonaws.com/first_V";

let orders = [];
let previousMonitoringMetrics = null;
let selectedAiOrderId = null;
let aiPreviousResponseId = null;

// ---------- Helpers ----------

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function money(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(Number(value) || 0);
}

function dateTime(value) {
  if (!value) return "—";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message, type = "info") {
  const toast = document.createElement("div");

  toast.className = "toast";
  toast.dataset.type = type;
  toast.textContent = message;

  $("#toast-container").appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3500);
}

async function api(path, options = {}) {
  const config = {
    method: options.method || "GET",
    headers: {}
  };

  if (options.body !== undefined) {
    config.headers["Content-Type"] = "application/json";
    config.body = JSON.stringify(options.body);
  }

  const response = await fetch(
    `${API_BASE_URL}${path}`,
    config
  );

  const text = await response.text();

  let data = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    const message =
      data &&
      typeof data === "object" &&
      (data.message || data.error)
        ? (data.message || data.error)
        : `Request failed (${response.status})`;

    throw new Error(message);
  }

  return data;
}


// ---------- Navigation ----------

const PAGE_META = {
  overview: [
    "Overview",
    "Your order management dashboard"
  ],

  orders: [
    "Orders",
    "Create, view, update and delete orders"
  ],

  notifications: [
    "Notifications",
    "Manage deletion email notifications"
  ],

  reports: [
    "Reports",
    "Generate the deleted orders PDF report"
  ],

  monitoring: [
    "System Monitoring",
    "Live AWS Lambda metrics from Amazon CloudWatch"
  ],

  ai: [
    "AI Order Assistant",
    "Load an order and chat with AI about it"
  ]
};

function showPage(name) {

  $$(".page").forEach((page) => {
    page.hidden =
      page.id !== `page-${name}`;
  });

  $$(".nav-item").forEach((button) => {
    button.classList.toggle(
      "is-active",
      button.dataset.page === name
    );
  });

  const [title, subtitle] =
    PAGE_META[name];

  $("#page-title").textContent = title;
  $("#page-subtitle").textContent = subtitle;

  if (name === "orders") {
    loadOrders();
  }

  if (name === "monitoring") {
    loadSystemMetrics();
  }
}

function initNavigation() {

  $$(".nav-item").forEach((button) => {

    button.addEventListener(
      "click",
      () => showPage(button.dataset.page)
    );

  });

  $$("[data-go]").forEach((button) => {

    button.addEventListener(
      "click",
      () => showPage(button.dataset.go)
    );

  });
}


// ---------- Orders ----------

async function loadOrders() {

  const state = $("#orders-state");

  try {

    state.hidden = false;
    state.textContent =
      "Loading orders...";

    const data =
      await api("/orders");

    orders =
      Array.isArray(data)
        ? data
        : (data?.orders || []);

    orders.sort(
      (a, b) =>
        new Date(b.creation_date) -
        new Date(a.creation_date)
    );

    state.hidden = true;

    renderOrders();
    renderOverview();

  } catch (error) {

    state.hidden = false;
    state.textContent =
      error.message;

    showToast(
      error.message,
      "error"
    );
  }
}

function renderOrders() {

  const query =
    $("#order-search")
      .value
      .trim()
      .toLowerCase();

  const filtered =
    orders.filter((order) => {

      return (
        String(order.order_id || "")
          .toLowerCase()
          .includes(query) ||

        String(order.description || "")
          .toLowerCase()
          .includes(query)
      );

    });

  const body =
    $("#orders-body");

  if (!filtered.length) {

    body.innerHTML = `
      <tr>
        <td colspan="6">
          No orders found.
        </td>
      </tr>
    `;

    return;
  }

  body.innerHTML =
    filtered.map((order) => `

      <tr>

        <td data-label="Order ID">
          <span class="simple-id">
            ${escapeHtml(order.order_id)}
          </span>
        </td>

        <td data-label="Description">
          ${escapeHtml(
            order.description || "—"
          )}
        </td>

        <td data-label="Price">
          ${money(order.price)}
        </td>

        <td data-label="Created">
          ${dateTime(
            order.creation_date
          )}
        </td>

        <td data-label="Last Modified">
          ${dateTime(
            order.last_modified_date
          )}
        </td>

        <td data-label="Actions">

          <div class="simple-order-actions">

            <button
              class="btn btn-ghost btn-sm"
              data-action="view"
              data-id="${escapeHtml(order.order_id)}">
              View
            </button>

            <button
              class="btn btn-secondary btn-sm"
              data-action="edit"
              data-id="${escapeHtml(order.order_id)}">
              Edit
            </button>

            <button
              class="btn btn-danger btn-sm"
              data-action="delete"
              data-id="${escapeHtml(order.order_id)}">
              Delete
            </button>

          </div>

        </td>

      </tr>

    `).join("");
}

async function createOrder(event) {

  event.preventDefault();

  const description =
    $("#create-description")
      .value
      .trim();

  const price =
    Number(
      $("#create-price").value
    );

  if (
    !description ||
    !Number.isFinite(price) ||
    price < 0
  ) {

    showToast(
      "Enter a valid description and price.",
      "warning"
    );

    return;
  }

  try {

    await api("/orders", {
      method: "POST",
      body: {
        description,
        price
      }
    });

    event.target.reset();

    showToast(
      "Order created successfully.",
      "success"
    );

    await loadOrders();

  } catch (error) {

    showToast(
      error.message,
      "error"
    );
  }
}

async function viewOrder(orderId) {

  openModal(
    "Order Details",
    "<p>Loading...</p>"
  );

  try {

    const data =
      await api(
        `/orders/${encodeURIComponent(orderId)}`
      );

    const order =
      data?.order || data;

    $("#modal-body").innerHTML = `

      <p>
        <strong>Order ID:</strong>
        <br>
        <span class="simple-id">
          ${escapeHtml(order.order_id)}
        </span>
      </p>

      <p>
        <strong>Description:</strong>
        <br>
        ${escapeHtml(
          order.description || "—"
        )}
      </p>

      <p>
        <strong>Price:</strong>
        <br>
        ${money(order.price)}
      </p>

      <p>
        <strong>Created:</strong>
        <br>
        ${dateTime(
          order.creation_date
        )}
      </p>

      <p>
        <strong>Last Modified:</strong>
        <br>
        ${dateTime(
          order.last_modified_date
        )}
      </p>

    `;

  } catch (error) {

    $("#modal-body")
      .textContent =
      error.message;
  }
}

function editOrder(orderId) {

  const order =
    orders.find(
      (item) =>
        item.order_id === orderId
    );

  if (!order) return;

  openModal(
    "Edit Order",
    `

    <form id="edit-order-form">

      <div class="field">

        <label for="edit-description">
          Description
        </label>

        <input
          id="edit-description"
          required
          maxlength="200"
          value="${escapeHtml(
            order.description || ""
          )}">

      </div>

      <div class="field">

        <label for="edit-price">
          Price
        </label>

        <input
          id="edit-price"
          required
          type="number"
          min="0"
          step="0.01"
          value="${Number(order.price) || 0}">

      </div>

      <div class="modal-footer">

        <button
          type="submit"
          class="btn btn-primary">
          Save Changes
        </button>

      </div>

    </form>

    `
  );

  $("#edit-order-form")
    .addEventListener(
      "submit",
      async (event) => {

        event.preventDefault();

        const description =
          $("#edit-description")
            .value
            .trim();

        const price =
          Number(
            $("#edit-price").value
          );

        try {

          await api(
            `/orders/${encodeURIComponent(orderId)}`,
            {
              method: "PUT",
              body: {
                description,
                price
              }
            }
          );

          closeModal();

          showToast(
            "Order updated successfully.",
            "success"
          );

          await loadOrders();

        } catch (error) {

          showToast(
            error.message,
            "error"
          );
        }
      }
    );
}

async function deleteOrder(orderId) {

  const order =
    orders.find(
      (item) =>
        item.order_id === orderId
    );

  const label =
    order?.description ||
    orderId;

  if (
    !confirm(
      `Delete "${label}"?\n\nThis action cannot be undone.`
    )
  ) {
    return;
  }

  try {

    await api(
      `/orders/${encodeURIComponent(orderId)}`,
      {
        method: "DELETE"
      }
    );

    showToast(
      "Order deleted. Background processing continues asynchronously.",
      "success"
    );

    await loadOrders();

  } catch (error) {

    showToast(
      error.message,
      "error"
    );
  }
}

function handleOrderTableClick(event) {

  const button =
    event.target.closest(
      "button[data-action]"
    );

  if (!button) return;

  const orderId =
    button.dataset.id;

  if (
    button.dataset.action === "view"
  ) {
    viewOrder(orderId);
  }

  if (
    button.dataset.action === "edit"
  ) {
    editOrder(orderId);
  }

  if (
    button.dataset.action === "delete"
  ) {
    deleteOrder(orderId);
  }
}


// ---------- Overview ----------

function renderOverview() {

  const total =
    orders.reduce(
      (sum, order) =>
        sum +
        (Number(order.price) || 0),
      0
    );

  $("#metric-count")
    .textContent =
    orders.length;

  $("#metric-total")
    .textContent =
    money(total);

  $("#metric-average")
    .textContent =
    money(
      orders.length
        ? total / orders.length
        : 0
    );

  $("#metric-latest")
    .textContent =
    orders[0]
      ? dateTime(
          orders[0].creation_date
        )
      : "—";

  const recent =
    orders.slice(0, 5);

  $("#recent-orders").innerHTML =
    recent.length

      ? recent.map((order) => `

          <div class="recent-order-row">

            <div>

              <p class="recent-order-desc">
                ${escapeHtml(
                  order.description ||
                  "Untitled order"
                )}
              </p>

              <p class="recent-order-date">
                ${dateTime(
                  order.creation_date
                )}
              </p>

            </div>

            <span class="recent-order-price">
              ${money(order.price)}
            </span>

          </div>

        `).join("")

      : "<p>No orders yet.</p>";
}


// ---------- Notifications ----------

async function subscribe(event) {

  event.preventDefault();

  const email =
    $("#notification-email")
      .value
      .trim();

  await notificationRequest(
    "POST",
    "/notifications/subscribe",
    email,
    "Subscription request sent. Check your email for the AWS confirmation message."
  );
}

async function unsubscribe() {

  const email =
    $("#notification-email")
      .value
      .trim();

  if (!email) {

    showToast(
      "Enter an email address first.",
      "warning"
    );

    return;
  }

  await notificationRequest(
    "DELETE",
    "/notifications/unsubscribe",
    email,
    "Unsubscribe request completed."
  );
}

async function notificationRequest(
  method,
  path,
  email,
  successMessage
) {

  const result =
    $("#notification-result");

  try {

    result.hidden = false;
    result.textContent =
      "Sending request...";

    const data =
      await api(path, {
        method,
        body: { email }
      });

    result.textContent =
      data?.message ||
      successMessage;

    showToast(
      successMessage,
      "success"
    );

  } catch (error) {

    result.hidden = false;
    result.textContent =
      error.message;

    showToast(
      error.message,
      "error"
    );
  }
}


// ---------- Reports ----------

async function generateReport() {

  const button =
    $("#generate-report");

  const result =
    $("#report-result");

  button.disabled = true;
  button.textContent =
    "Generating report...";

  result.textContent = "";

  try {

    const data =
      await api(
        "/reports/deleted-orders"
      );

    const url =
      data?.report_url ||
      data?.url ||
      data?.pdf_url ||
      data?.download_url;

    if (!url) {

      throw new Error(
        "The API succeeded but no PDF URL was found in the response."
      );
    }

    const link =
      document.createElement("a");

    link.href = url;
    link.target = "_blank";
    link.rel =
      "noopener noreferrer";

    link.className =
      "btn btn-secondary";

    link.textContent =
      "Open PDF Report";

    result.appendChild(link);

    showToast(
      "PDF report generated successfully.",
      "success"
    );

  } catch (error) {

    result.textContent =
      error.message;

    showToast(
      error.message,
      "error"
    );

  } finally {

    button.disabled = false;

    button.textContent =
      "Generate PDF Report";
  }
}


// ---------- System Monitoring ----------

function showMonitoringActivityToast(changes) {
  const toast = document.createElement("div");
  toast.className = "toast monitoring-activity-toast";
  toast.dataset.type = changes.length ? "success" : "info";

  const title = document.createElement("div");
  title.className = "monitoring-toast-title";
  title.textContent = changes.length ? "New Lambda Activity" : "No New Activity";
  toast.appendChild(title);

  const message = document.createElement("div");
  message.className = "monitoring-toast-message";

  if (changes.length) {
    changes.forEach((change) => {
      const row = document.createElement("div");
      row.className = "monitoring-toast-row";

      const name = document.createElement("span");
      name.textContent = change.function_name;

      const count = document.createElement("strong");
      count.textContent = `+${change.delta}`;

      row.append(name, count);
      message.appendChild(row);
    });
  } else {
    message.textContent = "No Lambda functions were invoked since the last refresh.";
  }

  toast.appendChild(message);
  $("#toast-container").appendChild(toast);

  setTimeout(() => toast.remove(), 5500);
}

async function loadSystemMetrics(showActivity = false) {
  const state = $("#monitoring-state");
  const body = $("#monitoring-body");
  const refreshButton = $("#refresh-monitoring");

  try {
    state.hidden = false;
    state.textContent = "Loading CloudWatch metrics...";
    refreshButton.disabled = true;
    refreshButton.textContent = "Refreshing...";

    // Retrieve real Lambda invocation metrics from Amazon CloudWatch
    const data = await api("/system-metrics");
    const functions = Array.isArray(data?.functions) ? data.functions : [];

    const currentMetrics = Object.fromEntries(
      functions.map((item) => [
        item.function_name,
        Number(item.invocations || 0)
      ])
    );

    // Compare the new CloudWatch counters with the previous refresh.
    if (showActivity && previousMonitoringMetrics !== null) {
      const changes = functions
        .map((item) => {
          const current = Number(item.invocations || 0);
          const previous = Number(previousMonitoringMetrics[item.function_name] || 0);
          return {
            function_name: item.function_name,
            delta: Math.max(0, current - previous)
          };
        })
        .filter((item) => item.delta > 0)
        .sort((a, b) => b.delta - a.delta);

      showMonitoringActivityToast(changes);
    }

    // Save this snapshot for the next refresh comparison.
    previousMonitoringMetrics = currentMetrics;

    $("#monitoring-total").textContent =
      Number(data?.total_invocations || 0).toLocaleString();

    $("#monitoring-functions").textContent = functions.length.toLocaleString();
    $("#monitoring-period").textContent = data?.period || "Today";

    if (!functions.length) {
      body.innerHTML = `
        <tr>
          <td colspan="2">No CloudWatch metrics were found.</td>
        </tr>
      `;
    } else {
      const sortedFunctions = [...functions].sort(
        (a, b) => Number(b.invocations || 0) - Number(a.invocations || 0)
      );

      body.innerHTML = sortedFunctions.map((item) => `
        <tr>
          <td data-label="Lambda Function">
            <span class="simple-id">${escapeHtml(item.function_name)}</span>
          </td>
          <td data-label="Invocations Today">
            ${Number(item.invocations || 0).toLocaleString()}
          </td>
        </tr>
      `).join("");
    }

    state.hidden = true;
  } catch (error) {
    state.hidden = false;
    state.textContent = error.message;

    body.innerHTML = `
      <tr>
        <td colspan="2">Unable to load CloudWatch metrics.</td>
      </tr>
    `;

    showToast(error.message, "error");
  } finally {
    refreshButton.disabled = false;
    refreshButton.textContent = "Refresh Metrics";
  }
}


// ---------- Modal ----------

function openModal(title, content) {

  $("#modal-title")
    .textContent =
    title;

  $("#modal-body")
    .innerHTML =
    content;

  $("#order-modal")
    .hidden =
    false;
}

function closeModal() {

  $("#order-modal")
    .hidden =
    true;
}

function initModal() {

  $("#modal-close")
    .addEventListener(
      "click",
      closeModal
    );

  $("#order-modal")
    .addEventListener(
      "click",
      (event) => {

        if (
          event.target.id ===
          "order-modal"
        ) {
          closeModal();
        }

      }
    );
}


// ---------- AI Order Assistant ----------

function renderAiOrder(order) {
  $("#ai-detail-id").textContent = order.order_id || "—";
  $("#ai-detail-description").textContent = order.description || "—";
  $("#ai-detail-price").textContent = money(order.price);
  $("#ai-detail-created").textContent = dateTime(order.creation_date);
  $("#ai-detail-modified").textContent = dateTime(order.last_modified_date);
}

function addAiMessage(text, role) {
  const message = document.createElement("div");
  message.className = `ai-message ai-message--${role}`;
  message.textContent = text;
  const container = $("#ai-chat-messages");
  container.appendChild(message);
  container.scrollTop = container.scrollHeight;
}

function resetAiChat() {
  aiPreviousResponseId = null;
  const container = $("#ai-chat-messages");
  container.innerHTML = "";
  addAiMessage("Ask me anything about this order.", "assistant");
}

async function loadAiOrder(event) {
  event.preventDefault();
  const orderId = $("#ai-order-id").value.trim();
  const button = $("#ai-load-order");
  const state = $("#ai-load-state");
  if (!orderId) return;

  button.disabled = true;
  button.textContent = "Loading...";
  state.textContent = "Loading order...";

  try {
    const data = await api(`/orders/${encodeURIComponent(orderId)}`);
    const order = data?.order || data;
    if (!order || !order.order_id) throw new Error("Order data was not returned");

    selectedAiOrderId = order.order_id;
    renderAiOrder(order);
    resetAiChat();
    $("#ai-workspace").hidden = false;
    state.textContent = "Order loaded successfully.";
    showToast("Order loaded for AI chat", "success");
  } catch (error) {
    selectedAiOrderId = null;
    $("#ai-workspace").hidden = true;
    state.textContent = error.message;
    showToast(error.message, "error");
  } finally {
    button.disabled = false;
    button.textContent = "Load Order";
  }
}

async function sendAiMessage(event) {
  event.preventDefault();
  if (!selectedAiOrderId) {
    showToast("Load an order first", "warning");
    return;
  }

  const input = $("#ai-message");
  const button = $("#ai-send");
  const message = input.value.trim();
  if (!message) return;

  addAiMessage(message, "user");
  input.value = "";
  input.disabled = true;
  button.disabled = true;
  button.textContent = "Thinking...";

  const thinking = document.createElement("div");
  thinking.className = "ai-message ai-message--assistant ai-message--thinking";
  thinking.textContent = "Thinking...";
  $("#ai-chat-messages").appendChild(thinking);

  try {
    const data = await api("/ai/chat", {
      method: "POST",
      body: {
        order_id: selectedAiOrderId,
        message,
        previous_response_id: aiPreviousResponseId
      }
    });

    thinking.remove();
    aiPreviousResponseId = data.response_id || null;
    addAiMessage(data.reply || "No response received.", "assistant");
  } catch (error) {
    thinking.remove();
    addAiMessage(`Error: ${error.message}`, "assistant");
    showToast(error.message, "error");
  } finally {
    input.disabled = false;
    button.disabled = false;
    button.textContent = "Send";
    input.focus();
  }
}

// ---------- Startup ----------

function init() {

  // Initialize navigation and modal behavior
  initNavigation();
  initModal();

  // Display the current date
  $("#today").textContent =
    new Date().toLocaleDateString(
      "en-US",
      {
        weekday: "long",
        month: "long",
        day: "numeric"
      }
    );

  // Order events
  $("#create-order-form")
    .addEventListener(
      "submit",
      createOrder
    );

  $("#refresh-orders")
    .addEventListener(
      "click",
      loadOrders
    );

  $("#order-search")
    .addEventListener(
      "input",
      renderOrders
    );

  $("#orders-body")
    .addEventListener(
      "click",
      handleOrderTableClick
    );

  // Notification events
  $("#notification-form")
    .addEventListener(
      "submit",
      subscribe
    );

  $("#unsubscribe-button")
    .addEventListener(
      "click",
      unsubscribe
    );

  // Report event
  $("#generate-report")
    .addEventListener(
      "click",
      generateReport
    );

  // CloudWatch monitoring event
  $("#refresh-monitoring")
    .addEventListener(
      "click",
      () => loadSystemMetrics(true)
    );

  // AI Order Assistant events
  $("#ai-order-form").addEventListener("submit", loadAiOrder);
  $("#ai-chat-form").addEventListener("submit", sendAiMessage);
  $("#ai-clear-chat").addEventListener("click", resetAiChat);

  // Initial backend load
  // A failure here does not break navigation
  loadOrders();
}

document.addEventListener(
  "DOMContentLoaded",
  init
);
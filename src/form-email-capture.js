const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function bindEmailCaptureForm(formEl, endpointUrl) {
  if (!formEl || !endpointUrl) {
    return;
  }

  const input = formEl.querySelector("#email");
  const status = formEl.querySelector("#form-status");
  const button = formEl.querySelector("button[type='submit']");

  formEl.addEventListener("submit", (event) => {
    event.preventDefault();

    if (!input || !status || !button) {
      return;
    }

    const email = input.value.trim();
    if (!EMAIL_REGEX.test(email)) {
      status.className = "form-status error";
      status.textContent = "Please enter a valid email address.";
      return;
    }

    button.disabled = true;
    status.className = "form-status";
    status.textContent = "Submitting...";

    fetch(endpointUrl, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    })
      .catch(() => {
        // no-cors responses are opaque; network errors are safely ignored for optimistic UX
      })
      .finally(() => {
        status.className = "form-status success";
        status.textContent = "Thanks. We will send updates.";
        input.value = "";
        button.disabled = false;
      });
  });
}

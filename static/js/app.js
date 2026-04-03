const state = {
  user: null,
  tasks: [],
  notes: [],
  reminders: [],
  editingTaskId: null,
  editingNoteId: null,
  viewMonth: new Date(),
};

const authShell = document.getElementById("authShell");
const appShell = document.getElementById("appShell");
const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const forgotForm = document.getElementById("forgotForm");
const forgotToggleButton = document.getElementById("forgotToggleBtn");
const generateCodeButton = document.getElementById("generateCodeBtn");
const loginMessage = document.getElementById("loginMessage");
const registerMessage = document.getElementById("registerMessage");
const forgotMessage = document.getElementById("forgotMessage");
const logoutButton = document.getElementById("logoutButton");
const notificationButton = document.getElementById("notificationBtn");
const userNameEl = document.getElementById("userName");

const taskForm = document.getElementById("taskForm");
const noteForm = document.getElementById("noteForm");
const taskList = document.getElementById("taskList");
const noteList = document.getElementById("noteList");
const taskSearch = document.getElementById("taskSearch");
const statusFilter = document.getElementById("statusFilter");
const noteSearch = document.getElementById("noteSearch");
const noteSort = document.getElementById("noteSort");
const insightList = document.getElementById("insightList");
const focusText = document.getElementById("focusText");
const focusHint = document.getElementById("focusHint");
const activeTasksEl = document.getElementById("activeTasks");
const dueSoonEl = document.getElementById("dueSoon");
const noteCountEl = document.getElementById("noteCount");
const completionRateEl = document.getElementById("completionRate");
const monthLabel = document.getElementById("monthLabel");
const prevMonthButton = document.getElementById("prevMonthButton");
const nextMonthButton = document.getElementById("nextMonthButton");
const calendarGrid = document.getElementById("calendarGrid");
const reminderList = document.getElementById("reminderList");

const priorityOrder = { high: 0, medium: 1, low: 2 };

function showAuthShell() {
  authShell.classList.remove("hidden");
  appShell.classList.add("hidden");
}

function showAppShell() {
  authShell.classList.add("hidden");
  appShell.classList.remove("hidden");
}

function setForgotVisible(isVisible) {
  forgotForm.classList.toggle("hidden", !isVisible);
  forgotToggleButton.textContent = isVisible ? "Hide reset form" : "Forgot password?";
}

function setMessage(target, message, isError = true) {
  target.textContent = message;
  target.dataset.state = message ? (isError ? "error" : "success") : "";
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "Something went wrong.");
    error.status = response.status;
    throw error;
  }

  return data;
}

function formatDate(value) {
  if (!value) return "No due date";
  const dateValue = new Date(`${value}T00:00:00`);
  if (Number.isNaN(dateValue.getTime())) return "No due date";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(dateValue);
}

function formatShortDate(value) {
  if (!value) return "No date";
  const dateValue = new Date(`${value}T00:00:00`);
  if (Number.isNaN(dateValue.getTime())) return "No date";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(dateValue);
}

function dayDifference(value) {
  if (!value) return null;
  const due = new Date(`${value}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function cleanText(value) {
  return String(value || "").trim().toLowerCase();
}

function toIsoDate(dateValue) {
  const year = dateValue.getFullYear();
  const month = String(dateValue.getMonth() + 1).padStart(2, "0");
  const day = String(dateValue.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function renderInsights() {
  const upcoming = state.tasks
    .filter((task) => task.status !== "completed")
    .map((task) => ({ ...task, diff: dayDifference(task.dueDate) }))
    .sort((left, right) => {
      const leftScore = left.diff === null ? 999 : left.diff;
      const rightScore = right.diff === null ? 999 : right.diff;
      if (leftScore !== rightScore) return leftScore - rightScore;
      return priorityOrder[left.priority] - priorityOrder[right.priority];
    });

  const topTasks = upcoming.slice(0, 3);
  insightList.innerHTML = "";

  if (topTasks.length === 0) {
    insightList.innerHTML = '<div class="insight-pill">No active deadlines. Use this space to start your next assignment or save a revision note.</div>';
    return;
  }

  topTasks.forEach((task) => {
    const diffText =
      task.diff === null
        ? "No date set"
        : task.diff < 0
        ? `${Math.abs(task.diff)} day${Math.abs(task.diff) === 1 ? "" : "s"} overdue`
        : task.diff === 0
        ? "Due today"
        : `${task.diff} day${task.diff === 1 ? "" : "s"} left`;

    const pill = document.createElement("div");
    pill.className = "insight-pill";
    pill.innerHTML = `<strong>${task.title}</strong> · ${task.course || "General"}<br />${diffText} · ${task.priority} priority`;
    insightList.appendChild(pill);
  });
}

function setFocusSummary() {
  const activeTasks = state.tasks.filter((task) => task.status !== "completed");
  const overdue = activeTasks.filter((task) => {
    const diff = dayDifference(task.dueDate);
    return diff !== null && diff < 0;
  });
  const urgent = activeTasks.filter((task) => {
    const diff = dayDifference(task.dueDate);
    return diff !== null && diff >= 0 && diff <= 2;
  });

  if (overdue.length > 0) {
    focusText.textContent = `${overdue.length} overdue task${overdue.length > 1 ? "s" : ""}`;
    focusHint.textContent = `Start with ${overdue[0].title} before anything else.`;
  } else if (urgent.length > 0) {
    focusText.textContent = `${urgent.length} due soon`;
    focusHint.textContent = `Your next deadline is ${urgent[0].title}.`;
  } else if (activeTasks.length > 0) {
    focusText.textContent = "Stable progress";
    focusHint.textContent = `You have ${activeTasks.length} active task${activeTasks.length > 1 ? "s" : ""} in motion.`;
  } else {
    focusText.textContent = "All caught up";
    focusHint.textContent = "Add a new assignment or save notes for your next session.";
  }
}

function renderStats() {
  const activeTasks = state.tasks.filter((task) => task.status !== "completed");
  const completedTasks = state.tasks.filter((task) => task.status === "completed");
  const soonCount = state.tasks.filter((task) => {
    const diff = dayDifference(task.dueDate);
    return task.status !== "completed" && diff !== null && diff >= 0 && diff <= 2;
  }).length;
  const completion = state.tasks.length === 0 ? 0 : Math.round((completedTasks.length / state.tasks.length) * 100);

  activeTasksEl.textContent = activeTasks.length;
  dueSoonEl.textContent = soonCount;
  noteCountEl.textContent = state.notes.length;
  completionRateEl.textContent = `${completion}%`;
}

function getFilteredTasks() {
  const searchValue = cleanText(taskSearch.value);
  const statusValue = statusFilter.value;

  return state.tasks.filter((task) => {
    const matchesSearch =
      !searchValue ||
      [task.title, task.course, task.notes, task.link].join(" ").toLowerCase().includes(searchValue);
    const matchesStatus = statusValue === "all" || task.status === statusValue;
    return matchesSearch && matchesStatus;
  });
}

function getFilteredNotes() {
  const searchValue = cleanText(noteSearch.value);
  const sortValue = noteSort.value;
  let notes = state.notes.filter((note) => {
    const matchesSearch =
      !searchValue ||
      [note.title, note.subject, note.content, note.link].join(" ").toLowerCase().includes(searchValue);
    return matchesSearch;
  });

  if (sortValue === "pinned") {
    notes = [...notes].sort((left, right) => {
      if (left.pinned !== right.pinned) return Number(right.pinned) - Number(left.pinned);
      return new Date(right.createdAt) - new Date(left.createdAt);
    });
  }

  return notes;
}

function renderTaskCard(task) {
  const template = document.getElementById("taskTemplate");
  const card = template.content.firstElementChild.cloneNode(true);
  const title = card.querySelector("h3");
  const badge = card.querySelector(".badge");
  const metaLine = card.querySelector(".meta-line");
  const bodyCopy = card.querySelector(".body-copy");
  const link = card.querySelector(".resource-link");
  const statusButton = card.querySelector('[data-action="toggle-status"]');
  const editButton = card.querySelector('[data-action="edit"]');
  const deleteButton = card.querySelector('[data-action="delete"]');

  title.textContent = task.title;
  badge.textContent = `${task.priority} priority`;
  badge.classList.add(`priority-${task.priority}`);

  const dueDays = dayDifference(task.dueDate);
  const dueState =
    dueDays === null
      ? "No due date"
      : dueDays < 0
      ? `${Math.abs(dueDays)} day${Math.abs(dueDays) === 1 ? "" : "s"} overdue`
      : dueDays === 0
      ? "Due today"
      : `${dueDays} day${dueDays === 1 ? "" : "s"} left`;

  metaLine.textContent = `${task.course || "General"} • ${formatDate(task.dueDate)} • ${dueState}`;
  bodyCopy.textContent = task.notes || "No extra notes yet.";

  if (task.link) {
    link.href = task.link;
  } else {
    link.removeAttribute("href");
    link.style.pointerEvents = "none";
    link.style.opacity = 0.5;
    link.textContent = "No resource link";
  }

  if (task.status === "completed") {
    badge.classList.add("status-completed");
  } else if (task.status === "in-progress") {
    badge.classList.add("status-in-progress");
  }

  statusButton.textContent = task.status === "completed" ? "Mark active" : "Mark done";
  statusButton.addEventListener("click", () => toggleTaskStatus(task));

  editButton.textContent = "Edit";
  editButton.addEventListener("click", () => startEditTask(task));
  deleteButton.addEventListener("click", () => removeTask(task.id));

  return card;
}

function renderNoteCard(note) {
  const template = document.getElementById("noteTemplate");
  const card = template.content.firstElementChild.cloneNode(true);
  const title = card.querySelector("h3");
  const badge = card.querySelector(".badge");
  const metaLine = card.querySelector(".meta-line");
  const bodyCopy = card.querySelector(".body-copy");
  const link = card.querySelector(".resource-link");
  const pinButton = card.querySelector('[data-action="toggle-pin"]');
  const editButton = card.querySelector('[data-action="edit"]');
  const deleteButton = card.querySelector('[data-action="delete"]');

  title.textContent = note.title;
  badge.textContent = note.pinned ? "Pinned" : "Note";
  metaLine.textContent = `${note.subject || "General"} • ${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(note.createdAt))}`;
  bodyCopy.textContent = note.content;

  if (note.link) {
    link.href = note.link;
  } else {
    link.removeAttribute("href");
    link.style.pointerEvents = "none";
    link.style.opacity = 0.5;
    link.textContent = "No reference link";
  }

  pinButton.textContent = note.pinned ? "Unpin" : "Pin";
  pinButton.addEventListener("click", () => togglePin(note));

  editButton.addEventListener("click", () => startEditNote(note));
  deleteButton.addEventListener("click", () => removeNote(note.id));

  return card;
}

function renderTasks() {
  const tasks = getFilteredTasks().sort((left, right) => {
    const leftDiff = dayDifference(left.dueDate);
    const rightDiff = dayDifference(right.dueDate);
    const leftRank = leftDiff === null ? 9999 : leftDiff;
    const rightRank = rightDiff === null ? 9999 : rightDiff;
    if (left.status !== right.status) {
      return (left.status === "completed") - (right.status === "completed");
    }
    if (leftRank !== rightRank) return leftRank - rightRank;
    return priorityOrder[left.priority] - priorityOrder[right.priority];
  });

  taskList.innerHTML = "";

  if (tasks.length === 0) {
    taskList.innerHTML = '<div class="empty-state">No tasks match the current filters.</div>';
    return;
  }

  tasks.forEach((task) => taskList.appendChild(renderTaskCard(task)));
}

function renderNotes() {
  const notes = getFilteredNotes();
  noteList.innerHTML = "";

  if (notes.length === 0) {
    noteList.innerHTML = '<div class="empty-state">No notes match the current filters.</div>';
    return;
  }

  notes.forEach((note) => noteList.appendChild(renderNoteCard(note)));
}

function renderCalendar() {
  const monthStart = new Date(state.viewMonth.getFullYear(), state.viewMonth.getMonth(), 1);
  const monthEnd = new Date(state.viewMonth.getFullYear(), state.viewMonth.getMonth() + 1, 0);
  const totalDays = monthEnd.getDate();
  const startOffset = monthStart.getDay();
  const totalCells = Math.ceil((startOffset + totalDays) / 7) * 7;
  const todayKey = toIsoDate(new Date());
  const monthKey = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(monthStart);

  monthLabel.textContent = monthKey;
  calendarGrid.innerHTML = "";

  const tasksByDate = new Map();
  state.tasks.forEach((task) => {
    if (!task.dueDate) return;
    const items = tasksByDate.get(task.dueDate) || [];
    items.push(task);
    tasksByDate.set(task.dueDate, items);
  });

  for (let index = 0; index < totalCells; index += 1) {
    const dayNumber = index - startOffset + 1;
    const cellDate = new Date(state.viewMonth.getFullYear(), state.viewMonth.getMonth(), dayNumber);
    const inMonth = dayNumber >= 1 && dayNumber <= totalDays;
    const dateKey = toIsoDate(cellDate);
    const tasks = (tasksByDate.get(dateKey) || []).sort((left, right) => priorityOrder[left.priority] - priorityOrder[right.priority]);

    const cell = document.createElement("article");
    cell.className = "calendar-day";
    if (!inMonth) {
      cell.classList.add("calendar-day--other");
    }
    if (dateKey === todayKey) {
      cell.classList.add("calendar-day--today");
    }

    const dayHeader = document.createElement("div");
    dayHeader.className = "calendar-day__header";
    dayHeader.innerHTML = `<strong>${inMonth ? dayNumber : ""}</strong><span>${inMonth ? formatShortDate(dateKey) : ""}</span>`;
    cell.appendChild(dayHeader);

    const taskContainer = document.createElement("div");
    taskContainer.className = "calendar-day__tasks";

    if (tasks.length === 0) {
      const empty = document.createElement("span");
      empty.className = "calendar-day__empty";
      empty.textContent = inMonth ? "Open" : "";
      taskContainer.appendChild(empty);
    } else {
      tasks.slice(0, 2).forEach((task) => {
        const chip = document.createElement("span");
        chip.className = `calendar-task-chip calendar-task-chip--${task.priority}`;
        chip.textContent = task.title;
        taskContainer.appendChild(chip);
      });
      if (tasks.length > 2) {
        const overflow = document.createElement("span");
        overflow.className = "calendar-task-chip calendar-task-chip--overflow";
        overflow.textContent = `+${tasks.length - 2} more`;
        taskContainer.appendChild(overflow);
      }
    }

    cell.appendChild(taskContainer);
    calendarGrid.appendChild(cell);
  }
}

function renderReminders() {
  const reminders = state.reminders.length > 0 ? state.reminders : buildRemindersFromTasks(state.tasks);
  reminderList.innerHTML = "";

  if (reminders.length === 0) {
    reminderList.innerHTML = '<div class="empty-state">No urgent reminders right now.</div>';
    return;
  }

  reminders.slice(0, 6).forEach((reminder) => {
    const card = document.createElement("article");
    card.className = "item-card reminder-card";

    const metaText =
      reminder.daysLeft < 0
        ? `${Math.abs(reminder.daysLeft)} day${Math.abs(reminder.daysLeft) === 1 ? "" : "s"} overdue`
        : reminder.daysLeft === 0
        ? "Due today"
        : `${reminder.daysLeft} day${reminder.daysLeft === 1 ? "" : "s"} left`;

    card.innerHTML = `
      <div class="item-main">
        <div class="item-topline">
          <h3>${reminder.title}</h3>
          <span class="badge priority-${reminder.priority}">${reminder.priority} priority</span>
        </div>
        <p class="meta-line">${reminder.course || "General"} • ${formatShortDate(reminder.dueLabel)} • ${metaText}</p>
        <p class="body-copy">${reminder.notes || "Keep this task on your radar."}</p>
      </div>
    `;

    reminderList.appendChild(card);
  });
}

function buildRemindersFromTasks(tasks) {
  const reminders = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  tasks.forEach((task) => {
    if (task.status === "completed" || !task.dueDate) return;
    const due = new Date(`${task.dueDate}T00:00:00`);
    if (Number.isNaN(due.getTime())) return;
    const daysLeft = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (daysLeft <= 7) {
      reminders.push({ ...task, daysLeft, dueLabel: task.dueDate });
    }
  });

  return reminders.sort((left, right) => {
    const leftRank = left.daysLeft === null ? 999 : left.daysLeft;
    const rightRank = right.daysLeft === null ? 999 : right.daysLeft;
    if (leftRank !== rightRank) return leftRank - rightRank;
    return priorityOrder[left.priority] - priorityOrder[right.priority];
  });
}

function refreshUI() {
  userNameEl.textContent = state.user ? state.user.username : "Student";
  renderStats();
  renderTasks();
  renderNotes();
  renderInsights();
  renderCalendar();
  renderReminders();
  setFocusSummary();
}

async function loadWorkspace() {
  const data = await apiRequest("/api/state");
  state.user = data.user || state.user;
  state.tasks = data.tasks || [];
  state.notes = data.notes || [];
  state.reminders = data.reminders || buildRemindersFromTasks(state.tasks);
  showAppShell();
  refreshUI();
  maybeNotifyReminder();
}

async function bootstrap() {
  const response = await fetch("/api/me");
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.authenticated) {
    state.user = null;
    showAuthShell();
    return;
  }

  state.user = data.user;
  showAppShell();
  await loadWorkspace();
}

function resetTaskForm() {
  taskForm.reset();
  state.editingTaskId = null;
  taskForm.querySelector("button[type='submit']").textContent = "Save task";
}

function resetNoteForm() {
  noteForm.reset();
  state.editingNoteId = null;
  noteForm.querySelector("button[type='submit']").textContent = "Save note";
}

async function submitTask(event) {
  event.preventDefault();
  const formData = new FormData(taskForm);
  const payload = Object.fromEntries(formData.entries());
  payload.status = payload.status || "pending";
  payload.priority = payload.priority || "medium";

  try {
    if (state.editingTaskId) {
      await apiRequest(`/api/tasks/${state.editingTaskId}`, { method: "PUT", body: JSON.stringify(payload) });
    } else {
      await apiRequest("/api/tasks", { method: "POST", body: JSON.stringify(payload) });
    }
    resetTaskForm();
    await loadWorkspace();
  } catch (error) {
    if (error.status === 401) {
      showAuthShell();
      return;
    }
    alert(error.message);
  }
}

async function submitNote(event) {
  event.preventDefault();
  const formData = new FormData(noteForm);
  const payload = Object.fromEntries(formData.entries());
  payload.pinned = formData.get("pinned") === "on";

  try {
    if (state.editingNoteId) {
      await apiRequest(`/api/notes/${state.editingNoteId}`, { method: "PUT", body: JSON.stringify(payload) });
    } else {
      await apiRequest("/api/notes", { method: "POST", body: JSON.stringify(payload) });
    }
    resetNoteForm();
    await loadWorkspace();
  } catch (error) {
    if (error.status === 401) {
      showAuthShell();
      return;
    }
    alert(error.message);
  }
}

function startEditTask(task) {
  state.editingTaskId = task.id;
  taskForm.title.value = task.title || "";
  taskForm.course.value = task.course || "";
  taskForm.dueDate.value = task.dueDate || "";
  taskForm.priority.value = task.priority || "medium";
  taskForm.status.value = task.status || "pending";
  taskForm.link.value = task.link || "";
  taskForm.notes.value = task.notes || "";
  taskForm.querySelector("button[type='submit']").textContent = "Update task";
  window.location.hash = "#tasks";
}

function startEditNote(note) {
  state.editingNoteId = note.id;
  noteForm.title.value = note.title || "";
  noteForm.subject.value = note.subject || "";
  noteForm.content.value = note.content || "";
  noteForm.link.value = note.link || "";
  noteForm.pinned.checked = Boolean(note.pinned);
  noteForm.querySelector("button[type='submit']").textContent = "Update note";
  window.location.hash = "#notes";
}

async function removeTask(taskId) {
  if (!confirm("Delete this task?")) return;
  try {
    await apiRequest(`/api/tasks/${taskId}`, { method: "DELETE" });
    if (state.editingTaskId === taskId) resetTaskForm();
    await loadWorkspace();
  } catch (error) {
    if (error.status === 401) {
      showAuthShell();
      return;
    }
    alert(error.message);
  }
}

async function removeNote(noteId) {
  if (!confirm("Delete this note?")) return;
  try {
    await apiRequest(`/api/notes/${noteId}`, { method: "DELETE" });
    if (state.editingNoteId === noteId) resetNoteForm();
    await loadWorkspace();
  } catch (error) {
    if (error.status === 401) {
      showAuthShell();
      return;
    }
    alert(error.message);
  }
}

async function toggleTaskStatus(task) {
  const nextStatus = task.status === "completed" ? "pending" : "completed";
  try {
    await apiRequest(`/api/tasks/${task.id}`, {
      method: "PUT",
      body: JSON.stringify({ status: nextStatus }),
    });
    await loadWorkspace();
  } catch (error) {
    if (error.status === 401) {
      showAuthShell();
      return;
    }
    alert(error.message);
  }
}

async function togglePin(note) {
  try {
    await apiRequest(`/api/notes/${note.id}`, {
      method: "PUT",
      body: JSON.stringify({ pinned: !note.pinned }),
    });
    await loadWorkspace();
  } catch (error) {
    if (error.status === 401) {
      showAuthShell();
      return;
    }
    alert(error.message);
  }
}

async function submitLogin(event) {
  event.preventDefault();
  setMessage(loginMessage, "", false);
  const payload = Object.fromEntries(new FormData(loginForm).entries());

  try {
    const data = await apiRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    state.user = data.user;
    loginForm.reset();
    await loadWorkspace();
  } catch (error) {
    setMessage(loginMessage, error.message, true);
  }
}

async function submitRegister(event) {
  event.preventDefault();
  setMessage(registerMessage, "", false);
  const payload = Object.fromEntries(new FormData(registerForm).entries());

  try {
    const data = await apiRequest("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    state.user = data.user;
    registerForm.reset();
    await loadWorkspace();
  } catch (error) {
    setMessage(registerMessage, error.message, true);
  }
}

async function generateResetCode() {
  setMessage(forgotMessage, "", false);
  const identifier = (forgotForm.identifier.value || "").trim();
  if (!identifier) {
    setMessage(forgotMessage, "Enter username or email first.", true);
    return;
  }

  try {
    const data = await apiRequest("/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ identifier }),
    });
    forgotForm.resetCode.value = data.resetCode || "";
    setMessage(forgotMessage, `Reset code: ${data.resetCode}. Use it to set a new password.`, false);
  } catch (error) {
    setMessage(forgotMessage, error.message, true);
  }
}

async function submitForgotPassword(event) {
  event.preventDefault();
  setMessage(forgotMessage, "", false);
  const payload = Object.fromEntries(new FormData(forgotForm).entries());

  try {
    await apiRequest("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    setMessage(forgotMessage, "Password reset successful. You can log in now.", false);
    loginForm.identifier.value = payload.identifier;
    loginForm.password.value = "";
    forgotForm.reset();
    setForgotVisible(false);
  } catch (error) {
    setMessage(forgotMessage, error.message, true);
  }
}

async function logout() {
  try {
    await apiRequest("/api/auth/logout", { method: "POST" });
  } catch (error) {
    console.warn(error.message);
  }

  state.user = null;
  state.tasks = [];
  state.notes = [];
  state.reminders = [];
  state.editingTaskId = null;
  state.editingNoteId = null;
  taskForm.reset();
  noteForm.reset();
  showAuthShell();
}

function changeMonth(offset) {
  state.viewMonth = new Date(state.viewMonth.getFullYear(), state.viewMonth.getMonth() + offset, 1);
  renderCalendar();
}

async function enableNotifications() {
  if (!("Notification" in window)) {
    alert("Notifications are not supported in this browser.");
    return;
  }

  const permission = await Notification.requestPermission();
  if (permission === "granted") {
    maybeNotifyReminder(true);
  }
}

function maybeNotifyReminder(force = false) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  if (state.reminders.length === 0) return;

  const topReminder = state.reminders[0];
  const notificationKey = `${topReminder.id}-${topReminder.updatedAt}-${toIsoDate(new Date())}`;
  const storageKey = "student-manager-last-reminder";
  if (!force && localStorage.getItem(storageKey) === notificationKey) return;

  const title = topReminder.daysLeft < 0 ? "Overdue reminder" : "Upcoming reminder";
  const body = `${topReminder.title} is ${topReminder.daysLeft < 0 ? `${Math.abs(topReminder.daysLeft)} days overdue` : topReminder.daysLeft === 0 ? "due today" : `due in ${topReminder.daysLeft} days`}.`;
  new Notification(title, { body });
  localStorage.setItem(storageKey, notificationKey);
}

loginForm.addEventListener("submit", submitLogin);
registerForm.addEventListener("submit", submitRegister);
forgotForm.addEventListener("submit", submitForgotPassword);
forgotToggleButton.addEventListener("click", () => setForgotVisible(forgotForm.classList.contains("hidden")));
generateCodeButton.addEventListener("click", generateResetCode);
logoutButton.addEventListener("click", logout);
notificationButton.addEventListener("click", enableNotifications);
taskForm.addEventListener("submit", submitTask);
noteForm.addEventListener("submit", submitNote);
taskSearch.addEventListener("input", renderTasks);
statusFilter.addEventListener("change", renderTasks);
noteSearch.addEventListener("input", renderNotes);
noteSort.addEventListener("change", renderNotes);
prevMonthButton.addEventListener("click", () => changeMonth(-1));
nextMonthButton.addEventListener("click", () => changeMonth(1));

bootstrap().catch((error) => {
  console.error(error);
  showAuthShell();
});

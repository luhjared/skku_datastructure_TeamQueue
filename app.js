const STORAGE_KEY = "assignment-planner-ai:v2";
const MAX_ACTIVITY_ITEMS = 8;
const FIXED_OPENAI_MODEL = "gpt-4o-mini";

const el = {
  apiBadge: document.getElementById("apiBadge"),
  loadSampleButton: document.getElementById("loadSampleButton"),
  nextActionText: document.getElementById("nextActionText"),
  taskCountMetric: document.getElementById("taskCountMetric"),
  questionCountMetric: document.getElementById("questionCountMetric"),
  assignmentCoverageMetric: document.getElementById("assignmentCoverageMetric"),
  modeChip: document.getElementById("modeChip"),
  analysisModeChip: document.getElementById("analysisModeChip"),
  analysisSourceChip: document.getElementById("analysisSourceChip"),
  questionCountChip: document.getElementById("questionCountChip"),
  taskCountChip: document.getElementById("taskCountChip"),
  confirmedChip: document.getElementById("confirmedChip"),
  monitorStateChip: document.getElementById("monitorStateChip"),
  monitorSummaryChip: document.getElementById("monitorSummaryChip"),
  analysisTitle: document.getElementById("analysisTitle"),
  analysisSummary: document.getElementById("analysisSummary"),
  requirementsList: document.getElementById("requirementsList"),
  deliverablesList: document.getElementById("deliverablesList"),
  constraintsList: document.getElementById("constraintsList"),
  warningsList: document.getElementById("warningsList"),
  sharePreview: document.getElementById("sharePreview"),
  monitorStats: document.getElementById("monitorStats"),
  monitorBoard: document.getElementById("monitorBoard"),
  monitorAlerts: document.getElementById("monitorAlerts"),
  questionsList: document.getElementById("questionsList"),
  tasksList: document.getElementById("tasksList"),
  assignmentList: document.getElementById("assignmentList"),
  activityList: document.getElementById("activityList"),
  membersList: document.getElementById("membersList"),
  courseNameInput: document.getElementById("courseNameInput"),
  projectTitleInput: document.getElementById("projectTitleInput"),
  deadlineInput: document.getElementById("deadlineInput"),
  strategySelect: document.getElementById("strategySelect"),
  modelSelect: document.getElementById("modelSelect"),
  briefTextInput: document.getElementById("briefTextInput"),
  clarificationInput: document.getElementById("clarificationInput"),
  analyzeButton: document.getElementById("analyzeButton"),
  resetButton: document.getElementById("resetButton"),
  copySummaryButton: document.getElementById("copySummaryButton"),
  exportPlanButton: document.getElementById("exportPlanButton"),
  addMemberButton: document.getElementById("addMemberButton"),
  reanalyzeButton: document.getElementById("reanalyzeButton"),
  clearAnswersButton: document.getElementById("clearAnswersButton"),
  confirmAllButton: document.getElementById("confirmAllButton"),
  recalculateButton: document.getElementById("recalculateButton")
};

const MEMBER_STATUS_OPTIONS = [
  { value: "available", label: "가능" },
  { value: "busy", label: "바쁨" },
  { value: "away", label: "자리 비움" }
];

const TASK_STATUS_OPTIONS = [
  { value: "todo", label: "대기" },
  { value: "doing", label: "진행중" },
  { value: "blocked", label: "보류" },
  { value: "done", label: "완료" }
];

const PRIORITY_OPTIONS = [
  { value: "urgent", label: "긴급" },
  { value: "normal", label: "보통" },
  { value: "low", label: "낮음" }
];

const MODE_LABELS = {
  openai: "OpenAI 분석",
  local: "로컬 규칙",
  "local-c": "C 로컬 분석",
  "local-fallback": "로컬 대체",
  idle: "분석 대기"
};

const CATEGORY_LABELS = {
  coordination: "조율",
  planning: "기획",
  design: "디자인",
  implementation: "구현",
  verification: "검증",
  documentation: "문서",
  presentation: "발표",
  review: "검토",
  research: "조사",
  development: "개발",
  assignment: "배정",
  ppt: "PPT"
};

const SCREEN_ORDER = ["intake", "team", "analysis", "review", "share", "monitor"];

const SAMPLE_STATE = createSampleState();

let state = loadState();
let openaiHealth = {
  checked: false,
  configured: false
};

function createId(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function nowLabel() {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date());
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function splitRoles(value) {
  return String(value ?? "")
    .split(/[,/|·]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function clampNumber(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, numeric));
}

function makeMember(partial = {}) {
  return {
    id: String(partial.id || createId("member")),
    name: String(partial.name || ""),
    roles: Array.isArray(partial.roles)
      ? partial.roles.map((item) => String(item).trim()).filter(Boolean)
      : splitRoles(partial.roles),
    status: MEMBER_STATUS_OPTIONS.some((item) => item.value === partial.status)
      ? partial.status
      : "available",
    capacity: clampNumber(partial.capacity, 1, 8, 2),
    note: String(partial.note || "")
  };
}

function makeTask(partial = {}, index = 0) {
  return {
    id: String(partial.id || createId(`task_${index + 1}`)),
    title: String(partial.title || `업무 ${index + 1}`),
    category: String(partial.category || "기획"),
    priority: PRIORITY_OPTIONS.some((item) => item.value === partial.priority)
      ? partial.priority
      : "normal",
    estimatedHours: clampNumber(partial.estimatedHours, 0.5, 24, 1),
    notes: String(partial.notes || ""),
    suggestedRole: String(partial.suggestedRole || partial.category || "기획"),
    dependencies: Array.isArray(partial.dependencies) ? partial.dependencies.map(String) : []
  };
}

function makeQuestion(partial = {}, index = 0) {
  return {
    question: String(partial.question || `질문 ${index + 1}`),
    reason: String(partial.reason || ""),
    expectedAnswer: String(partial.expectedAnswer || "")
  };
}

function makeAssignment(partial = {}) {
  return {
    taskId: String(partial.taskId || ""),
    memberId: String(partial.memberId || ""),
    memberName: String(partial.memberName || ""),
    rationale: String(partial.rationale || ""),
    confidence: clampNumber(partial.confidence, 0, 1, 0.5)
  };
}

function normalizeAnalysis(analysis) {
  const project = analysis?.project || {};
  return {
    mode: String(analysis?.mode || "local"),
    project: {
      title: String(project.title || "학생 과제"),
      course: String(project.course || "과목명 미입력"),
      deadline: project.deadline ? String(project.deadline) : null,
      objective: String(project.objective || "")
    },
    summary: String(analysis?.summary || ""),
    requirements: Array.isArray(analysis?.requirements) ? analysis.requirements.map(String) : [],
    deliverables: Array.isArray(analysis?.deliverables) ? analysis.deliverables.map(String) : [],
    constraints: Array.isArray(analysis?.constraints) ? analysis.constraints.map(String) : [],
    questions: Array.isArray(analysis?.questions)
      ? analysis.questions.map((item, index) => makeQuestion(item, index))
      : [],
    tasks: Array.isArray(analysis?.tasks)
      ? analysis.tasks.map((item, index) => makeTask(item, index))
      : [],
    assignments: Array.isArray(analysis?.assignments)
      ? analysis.assignments.map((item) => makeAssignment(item))
      : [],
    nextActions: Array.isArray(analysis?.nextActions) ? analysis.nextActions.map(String) : [],
    warnings: Array.isArray(analysis?.warnings) ? analysis.warnings.map(String) : []
  };
}

function createBlankState() {
  return {
    courseName: "",
    projectTitle: "",
    deadline: "",
    strategy: "balanced",
    model: FIXED_OPENAI_MODEL,
    briefText: "",
    clarificationText: "",
    members: [],
    analysis: null,
    apiMode: "idle",
    warning: "",
    questionAnswers: {},
    manualAssignments: {},
    taskStates: {},
    confirmed: false,
    screen: "intake",
    activity: []
  };
}

function createSampleState() {
  return {
    ...createBlankState(),
    courseName: "데이터구조",
    projectTitle: "학생용 과제 텍스트 자동 분배기",
    deadline: "2026-04-12",
    strategy: "presentation",
    model: FIXED_OPENAI_MODEL,
    briefText:
      "이번 팀플은 과제 안내문을 읽고 역할을 나누는 학생용 웹앱을 설계하는 프로젝트다. 5분 발표와 8쪽 보고서가 필요하며, 웹 데모를 함께 시연해야 한다. 발표자료, 보고서 본문, 데모 화면, 기능 검증 결과를 제출한다. 팀원 역할은 발표, 자료조사, 구현, 디자인, 검토로 나눈다. 마감일은 4월 12일 23:59이다. 제출 형식과 최종 파일명 규칙은 팀이 다시 확인해야 한다.",
    members: [
      makeMember({
        id: "m1",
        name: "민지",
        roles: ["발표", "문서"],
        status: "available",
        capacity: 2,
        note: "설명 정리와 발표가 빠름"
      }),
      makeMember({
        id: "m2",
        name: "준호",
        roles: ["구현", "검증"],
        status: "available",
        capacity: 3,
        note: "코드와 테스트 담당"
      }),
      makeMember({
        id: "m3",
        name: "서연",
        roles: ["조사", "디자인"],
        status: "busy",
        capacity: 2,
        note: "자료 수집과 레이아웃 정리"
      }),
      makeMember({
        id: "m4",
        name: "태현",
        roles: ["정리", "검토"],
        status: "available",
        capacity: 2,
        note: "마감 전 검토와 파일 정리"
      })
    ],
    activity: [
      {
        title: "샘플 로드",
        detail: "과제 예시와 팀원 프로필을 불러왔습니다.",
        tone: "neutral",
        time: nowLabel()
      }
    ],
    screen: "intake"
  };
}

function normalizeLoadedState(raw) {
  const base = createBlankState();
  const merged = { ...base, ...(raw || {}) };
  merged.members = Array.isArray(merged.members) ? merged.members.map((item) => makeMember(item)) : [];
  merged.analysis = merged.analysis ? normalizeAnalysis(merged.analysis) : null;
  merged.questionAnswers = merged.questionAnswers && typeof merged.questionAnswers === "object"
    ? { ...merged.questionAnswers }
    : {};
  merged.manualAssignments = merged.manualAssignments && typeof merged.manualAssignments === "object"
    ? { ...merged.manualAssignments }
    : {};
  merged.taskStates = merged.taskStates && typeof merged.taskStates === "object"
    ? { ...merged.taskStates }
    : {};
  merged.activity = Array.isArray(merged.activity)
    ? merged.activity
        .map((item) => ({
          title: String(item?.title || ""),
          detail: String(item?.detail || ""),
          tone: ["neutral", "success", "warn", "error"].includes(item?.tone) ? item.tone : "neutral",
          time: String(item?.time || nowLabel())
        }))
        .filter((item) => item.title || item.detail)
    : [];
  merged.confirmed = Boolean(merged.confirmed);
  merged.screen = SCREEN_ORDER.includes(merged.screen) ? merged.screen : "intake";
  merged.apiMode = String(merged.apiMode || (merged.analysis ? merged.analysis.mode : "idle"));
  merged.warning = String(merged.warning || "");
  merged.courseName = String(merged.courseName || "");
  merged.projectTitle = String(merged.projectTitle || "");
  merged.deadline = String(merged.deadline || "");
  merged.strategy = ["balanced", "speed", "presentation"].includes(merged.strategy)
    ? merged.strategy
    : "balanced";
  merged.model = FIXED_OPENAI_MODEL;
  merged.briefText = String(merged.briefText || "");
  merged.clarificationText = String(merged.clarificationText || "");
  return merged;
}

function loadState() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return createBlankState();
    }
    return normalizeLoadedState(JSON.parse(stored));
  } catch {
    return createBlankState();
  }
}

function saveState() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage failures silently; the app still works without persistence.
  }
}

function memberDisplayName(memberId) {
  const member = state.members.find((item) => item.id === memberId);
  return member ? member.name.trim() || "이름 없음" : "";
}

function memberIdByName(memberName) {
  const normalized = normalizeText(memberName);
  if (!normalized) {
    return "";
  }
  const match = state.members.find((member) => normalizeText(member.name) === normalized);
  return match ? match.id : "";
}

function memberLabel(member) {
  const roles = member.roles.length ? member.roles.join(", ") : "역할 없음";
  const name = member.name.trim() || "이름 없음";
  return `${name} · ${roles}`;
}

function taskSignature(task) {
  return `${normalizeText(task.title)}|${normalizeText(task.category)}`;
}

function questionKey(question, index) {
  return `${index}:${normalizeText(question.question).slice(0, 42)}`;
}

function getRecommendedAssignmentMap() {
  const assignments = new Map();
  for (const item of state.analysis?.assignments || []) {
    const memberId = item.memberId || memberIdByName(item.memberName);
    assignments.set(item.taskId, {
      memberId,
      memberName: item.memberName || memberDisplayName(memberId),
      rationale: item.rationale,
      confidence: item.confidence
    });
  }
  return assignments;
}

function getCurrentAssignmentMemberId(taskId) {
  if (state.manualAssignments[taskId]) {
    return state.manualAssignments[taskId];
  }
  const recommended = getRecommendedAssignmentMap().get(taskId);
  return recommended?.memberId || "";
}

function getCurrentTaskStatus(taskId) {
  return state.taskStates[taskId] || "todo";
}

function statusLabel(status) {
  return TASK_STATUS_OPTIONS.find((item) => item.value === status)?.label || "대기";
}

function priorityLabel(priority) {
  return PRIORITY_OPTIONS.find((item) => item.value === priority)?.label || "보통";
}

function categoryLabel(category) {
  const normalized = String(category || "").trim();
  if (!normalized) {
    return "미분류";
  }
  return CATEGORY_LABELS[normalized.toLowerCase()] || normalized;
}

function memberStatusLabel(status) {
  return MEMBER_STATUS_OPTIONS.find((item) => item.value === status)?.label || "가능";
}

function modeLabel(mode) {
  return MODE_LABELS[mode] || "분석 대기";
}

function confidencePercent(value) {
  return `${Math.round(clampNumber(value, 0, 1, 0) * 100)}%`;
}

function formatListHTML(items, emptyMessage) {
  if (!items || !items.length) {
    return `<li class="empty-state">${escapeHtml(emptyMessage)}</li>`;
  }
  return items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

function addActivity(title, detail, tone = "neutral") {
  state.activity.unshift({
    title,
    detail,
    tone,
    time: nowLabel()
  });
  state.activity = state.activity.slice(0, MAX_ACTIVITY_ITEMS);
  saveState();
  renderActivity();
}

function updateDocumentTitle() {
  const prefix = state.projectTitle ? `${state.projectTitle} · ` : "";
  document.title = `${prefix}TeamQueue`;
}

function computeCoverage() {
  const tasks = state.analysis?.tasks || [];
  if (!tasks.length) {
    return 0;
  }
  const assigned = tasks.filter((task) => Boolean(getCurrentAssignmentMemberId(task.id))).length;
  return Math.round((assigned / tasks.length) * 100);
}

function computeCounts() {
  const tasks = state.analysis?.tasks || [];
  const questions = state.analysis?.questions || [];
  const blocked = tasks.filter((task) => getCurrentTaskStatus(task.id) === "blocked").length;
  const done = tasks.filter((task) => getCurrentTaskStatus(task.id) === "done").length;
  return {
    tasks: tasks.length,
    questions: questions.length,
    blocked,
    done
  };
}

function determineWorkflowStep() {
  return state.screen || getSuggestedScreen();
}

function getSuggestedScreen() {
  const tasks = state.analysis?.tasks || [];
  const questions = state.analysis?.questions || [];
  const coverage = computeCoverage();

  if (!state.briefText.trim() && !state.projectTitle.trim() && !state.members.length) {
    return "intake";
  }
  if (!state.members.length) {
    return "team";
  }
  if (!state.analysis) {
    return "analysis";
  }
  if (!state.confirmed) {
    if (questions.length && Object.values(state.questionAnswers || {}).some((value) => String(value).trim())) {
      return "analysis";
    }
    if (tasks.length && coverage === 100) {
      return "review";
    }
    return "review";
  }
  return "share";
}

function computeNextAction() {
  const counts = computeCounts();
  const questions = state.analysis?.questions || [];
  const tasks = state.analysis?.tasks || [];
  const unansweredQuestions = questions.filter((question, index) => {
    const key = questionKey(question, index);
    return !String(state.questionAnswers[key] || "").trim();
  }).length;

  if (!state.briefText.trim() && !state.projectTitle.trim()) {
    return "과제 텍스트를 붙여넣고 분석을 시작하세요.";
  }
  if (!state.members.length) {
    return "팀원 프로필을 먼저 추가하세요.";
  }
  if (!state.analysis) {
    return "AI 분석 시작을 눌러 작업과 배정을 생성하세요.";
  }
  if (!state.confirmed) {
    if (unansweredQuestions > 0) {
      return "질문 큐의 빈칸을 채운 뒤 재분석하면 배정 품질이 더 좋아집니다.";
    }
    if (counts.blocked > 0) {
      return "보류된 작업부터 해결하세요.";
    }
    if (computeCoverage() < 100 && tasks.length) {
      return "아직 배정되지 않은 작업이 있습니다. 담당자를 지정하세요.";
    }
    return "추천 배정을 검토하고 확정하세요.";
  }
  if (counts.done === tasks.length && tasks.length) {
    return "모든 작업이 완료됐습니다. 제출 전 최종 점검만 남았습니다.";
  }
  if (counts.blocked > 0) {
    return "팀플 모니터링에서 보류 작업을 먼저 풀어주세요.";
  }
  if (tasks.length) {
    return "팀플 모니터링에서 진행 상태를 업데이트하세요.";
  }
  return state.analysis.nextActions?.[0] || "배정 결과를 팀톡에 공유하고 진행 상태를 업데이트하세요.";
}

function populateFormFields() {
  el.courseNameInput.value = state.courseName;
  el.projectTitleInput.value = state.projectTitle;
  el.deadlineInput.value = state.deadline;
  el.strategySelect.value = state.strategy;
  el.modelSelect.value = FIXED_OPENAI_MODEL;
  el.briefTextInput.value = state.briefText;
  el.clarificationInput.value = state.clarificationText;
}

function setScreen(screen, options = {}) {
  const nextScreen = SCREEN_ORDER.includes(screen) ? screen : "intake";
  state.screen = nextScreen;
  saveState();
  updateWorkflowState();
  updateScreenVisibility();
  if (options.scroll !== false) {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

function updateScreenVisibility() {
  const activeScreen = state.screen || getSuggestedScreen();
  document.querySelectorAll(".screen-panel").forEach((panel) => {
    panel.hidden = panel.dataset.screen !== activeScreen;
  });
}

function renderMembers() {
  if (!state.members.length) {
    el.membersList.innerHTML = `
      <div class="empty-state">
        팀원이 아직 없습니다. <strong>팀원 추가</strong>를 눌러 역할 태그와 가용 시간을 입력하세요.
      </div>
    `;
    return;
  }

  el.membersList.innerHTML = state.members
    .map((member) => {
      const roleValue = member.roles.join(", ");
      return `
        <div class="member-row" data-member-id="${escapeHtml(member.id)}">
          <input type="text" data-field="name" value="${escapeHtml(member.name)}" placeholder="이름" />
          <input type="text" data-field="roles" value="${escapeHtml(roleValue)}" placeholder="발표, 구현" />
          <select data-field="status">
            ${MEMBER_STATUS_OPTIONS.map(
              (option) =>
                `<option value="${option.value}" ${option.value === member.status ? "selected" : ""}>${option.label}</option>`
            ).join("")}
          </select>
          <input
            type="number"
            min="1"
            max="8"
            step="1"
            data-field="capacity"
            value="${escapeHtml(member.capacity)}"
            placeholder="가용"
          />
          <input type="text" data-field="note" value="${escapeHtml(member.note)}" placeholder="메모" />
          <button class="icon-button" type="button" data-action="remove-member" aria-label="팀원 삭제">×</button>
        </div>
      `;
    })
    .join("");
}

function renderQuestions() {
  const questions = state.analysis?.questions || [];
  if (!questions.length) {
    el.questionsList.innerHTML = `
      <div class="empty-state">
        추가 질문이 없습니다. 과제 설명이 충분하면 바로 작업 큐와 배정안이 나타납니다.
      </div>
    `;
    return;
  }

  el.questionsList.innerHTML = questions
    .map((question, index) => {
      const key = questionKey(question, index);
      const answer = state.questionAnswers[key] || "";
      return `
        <div class="queue-item" data-question-key="${escapeHtml(key)}">
          <div class="queue-title">
            <strong>${escapeHtml(question.question)}</strong>
            <span class="tag warn">확인 필요</span>
          </div>
          <p>${escapeHtml(question.reason)}</p>
          <label class="field">
            <span>답변</span>
            <input
              type="text"
              class="answer-input"
              data-field="answer"
              data-question-key="${escapeHtml(key)}"
              value="${escapeHtml(answer)}"
              placeholder="${escapeHtml(question.expectedAnswer || "답변 입력")}"
            />
          </label>
          <p class="hint">예상 답변: ${escapeHtml(question.expectedAnswer || "정보 보완 필요")}</p>
        </div>
      `;
    })
    .join("");
}

function renderTasks() {
  const tasks = state.analysis?.tasks || [];
  const recommendations = getRecommendedAssignmentMap();
  const selectableMembers = state.members.filter((member) => member.name.trim().length > 0);

  if (!tasks.length) {
    el.tasksList.innerHTML = `
      <div class="empty-state">
        아직 작업이 없습니다. 분석을 실행하면 과제 공지에서 작업 큐를 만들어 줍니다.
      </div>
    `;
    return;
  }

  el.tasksList.innerHTML = tasks
    .map((task, index) => {
      const recommended = recommendations.get(task.id);
      const currentMemberId = getCurrentAssignmentMemberId(task.id);
      const currentMemberName = memberDisplayName(currentMemberId) || "미배정";
      const recommendedMemberName = recommended?.memberName || memberDisplayName(recommended?.memberId) || "미정";
      const currentStatus = getCurrentTaskStatus(task.id);
      const confidence = clampNumber(recommended?.confidence ?? 0.15, 0, 1, 0.15);
      const dependencyTitles = (task.dependencies || [])
        .map((dependencyId) => tasks.find((candidate) => candidate.id === dependencyId)?.title)
        .filter(Boolean);

      return `
        <div class="task-row ${currentStatus === "done" ? "status-ok" : currentStatus === "blocked" ? "status-warn" : ""}" data-task-id="${escapeHtml(task.id)}">
          <div class="task-main">
            <div class="task-index">${index + 1}</div>
            <div class="task-copy">
              <div class="task-heading">
                <input class="task-title-input" type="text" data-field="title" value="${escapeHtml(task.title)}" />
                <div class="task-summary-pills">
                  <span class="tag">${escapeHtml(priorityLabel(task.priority))}</span>
                  <span class="tag neutral">현재 ${escapeHtml(currentMemberName)}</span>
                  <span class="tag neutral">추천 ${escapeHtml(recommendedMemberName)}</span>
                </div>
              </div>
              <p class="task-note">${escapeHtml(task.notes || "설명 없음")}</p>
              ${
                dependencyTitles.length
                  ? `<div class="tag-row">${dependencyTitles
                      .map((title) => `<span class="tag neutral">의존: ${escapeHtml(title)}</span>`)
                      .join("")}</div>`
                  : ""
              }
            </div>
            <div class="task-score">
              <span class="task-score-label">추천 적합도</span>
              <div class="confidence">
                <div class="confidence-bar"><span style="width: ${confidence * 100}%"></span></div>
                <span>${confidencePercent(confidence)}</span>
              </div>
            </div>
          </div>
          <div class="task-controls">
            <label class="task-control">
              <span>카테고리</span>
              <input type="text" data-field="category" value="${escapeHtml(task.category)}" />
            </label>
            <label class="task-control">
              <span>우선순위</span>
              <select data-field="priority">
                ${PRIORITY_OPTIONS.map(
                  (option) =>
                    `<option value="${option.value}" ${option.value === task.priority ? "selected" : ""}>${option.label}</option>`
                ).join("")}
              </select>
            </label>
            <label class="task-control">
              <span>예상 시간</span>
              <input type="number" min="0.5" step="0.5" data-field="estimatedHours" value="${escapeHtml(
                task.estimatedHours
              )}" />
            </label>
            <label class="task-control">
              <span>담당자</span>
              <select data-field="assigned">
                <option value="">미배정</option>
                ${selectableMembers
                  .map((member) => {
                    const selected = member.id === currentMemberId ? "selected" : "";
                    return `<option value="${escapeHtml(member.id)}" ${selected}>${escapeHtml(member.name || "이름 없음")}</option>`;
                  })
                  .join("")}
              </select>
            </label>
            <label class="task-control">
              <span>진행 상태</span>
              <select data-field="status">
                ${TASK_STATUS_OPTIONS.map(
                  (option) =>
                    `<option value="${option.value}" ${option.value === currentStatus ? "selected" : ""}>${option.label}</option>`
                ).join("")}
              </select>
            </label>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderAssignments() {
  const tasks = state.analysis?.tasks || [];
  const recommendations = getRecommendedAssignmentMap();

  if (!tasks.length) {
    el.assignmentList.innerHTML = `
      <div class="empty-state">
        배정 검토는 분석이 끝난 뒤 나타납니다. 작업 큐에서 팀원 선택을 조정한 뒤 확정할 수 있습니다.
      </div>
    `;
    return;
  }

  el.assignmentList.innerHTML = tasks
    .map((task, index) => {
      const recommended = recommendations.get(task.id);
      const currentMemberId = getCurrentAssignmentMemberId(task.id);
      const currentMemberName = memberDisplayName(currentMemberId) || "미배정";
      const recommendedMemberName = recommended?.memberName || memberDisplayName(recommended?.memberId) || "미정";
      const currentStatus = getCurrentTaskStatus(task.id);
      const confidence = recommended?.confidence ?? 0.15;
      const confirmedClass = state.confirmed ? "is-confirmed" : "";

      return `
        <div class="assignment-row ${confirmedClass}" data-task-id="${escapeHtml(task.id)}">
          <div class="assignment-main">
            <div class="assignment-title">
              <strong>${index + 1}. ${escapeHtml(task.title)}</strong>
              <span>${escapeHtml(task.category)} · 예상 ${escapeHtml(task.estimatedHours)}시간 · ${escapeHtml(
                statusLabel(currentStatus)
              )}</span>
            </div>
            <div class="assignment-meta">${escapeHtml(
              recommended?.rationale || "추천 사유가 아직 없습니다. 재분석을 실행하면 사유가 보입니다."
            )}</div>
          </div>
          <div class="assignment-side">
            <div class="assignment-controls">
              <span class="tag ${recommendedMemberName === "미정" ? "neutral" : ""}">추천: ${escapeHtml(
                recommendedMemberName
              )}</span>
              <span class="tag neutral">현재: ${escapeHtml(currentMemberName)}</span>
            </div>
            <div class="confidence">
              <div class="confidence-bar"><span style="width: ${clampNumber(confidence, 0, 1, 0.15) * 100}%"></span></div>
              <span>${confidencePercent(confidence)}</span>
            </div>
            <div class="assignment-actions">
              <button class="small-button accent" type="button" data-action="focus-task" data-task-id="${escapeHtml(
                task.id
              )}">큐에서 보기</button>
            </div>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderActivity() {
  if (!state.activity.length) {
    el.activityList.innerHTML = `<li class="empty-state">아직 기록이 없습니다. 분석, 확정, 복사 같은 동작이 여기 쌓입니다.</li>`;
    return;
  }

  el.activityList.innerHTML = state.activity
    .map(
      (item) => `
        <li class="${item.tone === "success" ? "status-ok" : item.tone === "warn" ? "status-warn" : item.tone === "error" ? "status-error" : ""}">
          <strong>${escapeHtml(item.title)}</strong>
          <div>${escapeHtml(item.detail)}</div>
          <small>${escapeHtml(item.time)}</small>
        </li>
      `
    )
    .join("");
}

function getTaskSnapshots() {
  const tasks = state.analysis?.tasks || [];
  const recommendations = getRecommendedAssignmentMap();

  return tasks.map((task) => {
    const assignedId = getCurrentAssignmentMemberId(task.id);
    const assignedName = memberDisplayName(assignedId) || "미배정";
    const status = getCurrentTaskStatus(task.id);
    const dependencyTasks = (task.dependencies || [])
      .map((dependencyId) => tasks.find((candidate) => candidate.id === dependencyId))
      .filter(Boolean);
    const waitingOn = dependencyTasks.filter((dependency) => getCurrentTaskStatus(dependency.id) !== "done");
    const recommended = recommendations.get(task.id);

    return {
      ...task,
      assignedId,
      assignedName,
      status,
      statusLabel: statusLabel(status),
      dependencyTasks,
      waitingOn,
      recommendedName: recommended?.memberName || memberDisplayName(recommended?.memberId) || "미정",
      confidence: clampNumber(recommended?.confidence ?? 0.15, 0, 1, 0.15)
    };
  });
}

function buildMonitoringBuckets(taskSnapshots) {
  const buckets = state.members
    .filter((member) => member.name.trim().length > 0)
    .map((member) => {
      const tasks = taskSnapshots.filter((task) => task.assignedId === member.id);
      const done = tasks.filter((task) => task.status === "done").length;
      const doing = tasks.filter((task) => task.status === "doing").length;
      const blocked = tasks.filter((task) => task.status === "blocked").length;
      const openTasks = tasks.filter((task) => task.status !== "done").length;
      const totalHours = tasks.reduce((sum, task) => sum + Number(task.estimatedHours || 0), 0);
      const remainingHours = tasks
        .filter((task) => task.status !== "done")
        .reduce((sum, task) => sum + Number(task.estimatedHours || 0), 0);

      return {
        ...member,
        tasks,
        done,
        doing,
        blocked,
        openTasks,
        totalHours,
        remainingHours,
        progress: tasks.length ? Math.round((done / tasks.length) * 100) : 0
      };
    });

  const unassignedTasks = taskSnapshots.filter((task) => !task.assignedId);
  if (unassignedTasks.length) {
    const done = unassignedTasks.filter((task) => task.status === "done").length;
    const doing = unassignedTasks.filter((task) => task.status === "doing").length;
    const blocked = unassignedTasks.filter((task) => task.status === "blocked").length;
    const openTasks = unassignedTasks.filter((task) => task.status !== "done").length;

    buckets.push({
      id: "unassigned",
      name: "미배정 작업",
      roles: ["재배정 필요"],
      status: "busy",
      capacity: 0,
      note: "아직 담당자가 확정되지 않았습니다.",
      tasks: unassignedTasks,
      done,
      doing,
      blocked,
      openTasks,
      totalHours: unassignedTasks.reduce((sum, task) => sum + Number(task.estimatedHours || 0), 0),
      remainingHours: unassignedTasks
        .filter((task) => task.status !== "done")
        .reduce((sum, task) => sum + Number(task.estimatedHours || 0), 0),
      progress: unassignedTasks.length ? Math.round((done / unassignedTasks.length) * 100) : 0
    });
  }

  return buckets;
}

function buildMonitoringAlerts(taskSnapshots, buckets) {
  const alerts = [];
  const blockedTasks = taskSnapshots.filter((task) => task.status === "blocked");
  const waitingTasks = taskSnapshots.filter((task) => task.waitingOn.length && task.status !== "done");
  const urgentOpenTasks = taskSnapshots.filter((task) => task.priority === "urgent" && task.status !== "done");
  const overloadedBuckets = buckets.filter(
    (bucket) => bucket.id !== "unassigned" && bucket.capacity && bucket.openTasks > bucket.capacity
  );

  if (!state.confirmed) {
    alerts.push({
      tone: "warn",
      title: "배정 확정 필요",
      items: ["현재는 초안 상태입니다. 4단계 검토 화면에서 배정을 확정한 뒤 진행 상황을 추적하세요."]
    });
  }

  if (blockedTasks.length) {
    alerts.push({
      tone: "danger",
      title: "보류 작업",
      items: blockedTasks.map((task) => `${task.title} · ${task.assignedName} · ${task.statusLabel}`)
    });
  }

  if (waitingTasks.length) {
    alerts.push({
      tone: "warn",
      title: "선행 작업 대기",
      items: waitingTasks.map(
        (task) => `${task.title} <- ${task.waitingOn.map((dependency) => dependency.title).join(", ")}`
      )
    });
  }

  if (urgentOpenTasks.length) {
    alerts.push({
      tone: "warn",
      title: "긴급 미완료",
      items: urgentOpenTasks.map((task) => `${task.title} · ${task.assignedName} · ${task.statusLabel}`)
    });
  }

  if (overloadedBuckets.length) {
    alerts.push({
      tone: "warn",
      title: "업무 편중",
      items: overloadedBuckets.map(
        (bucket) => `${bucket.name} · 열린 작업 ${bucket.openTasks}개 / 가용량 ${bucket.capacity}`
      )
    });
  }

  if (!alerts.length) {
    alerts.push({
      tone: "success",
      title: "큰 막힘 없음",
      items: ["현재 보류 작업이 없습니다. 진행중 작업의 상태만 꾸준히 업데이트하면 됩니다."]
    });
  }

  return alerts;
}

function renderMonitoring() {
  if (!el.monitorBoard || !el.monitorAlerts || !el.monitorStats || !el.monitorStateChip || !el.monitorSummaryChip) {
    return;
  }

  const tasks = state.analysis?.tasks || [];
  if (!tasks.length) {
    el.monitorStateChip.textContent = state.confirmed ? "배정 확정 완료" : "배정 미확정";
    el.monitorStateChip.className = `chip ${state.confirmed ? "status-ok" : ""}`;
    el.monitorSummaryChip.textContent = "0명 추적 중";
    el.monitorStats.innerHTML = `<div class="empty-state">아직 추적할 작업이 없습니다. 1~5 단계에서 분석과 배정을 먼저 완료하세요.</div>`;
    el.monitorBoard.innerHTML = `<div class="empty-state">배정된 작업이 생기면 담당자별 진행 카드가 여기에 나타납니다.</div>`;
    el.monitorAlerts.innerHTML = `<div class="empty-state">모니터링을 시작하면 막힘과 후속 액션이 정리됩니다.</div>`;
    return;
  }

  const taskSnapshots = getTaskSnapshots();
  const buckets = buildMonitoringBuckets(taskSnapshots);
  const alerts = buildMonitoringAlerts(taskSnapshots, buckets);
  const counts = computeCounts();
  const doing = taskSnapshots.filter((task) => task.status === "doing").length;
  const urgentOpen = taskSnapshots.filter((task) => task.priority === "urgent" && task.status !== "done").length;
  const overallProgress = tasks.length ? Math.round((counts.done / tasks.length) * 100) : 0;

  el.monitorStateChip.textContent = state.confirmed ? "배정 확정 완료" : "배정 초안 추적";
  el.monitorStateChip.className = `chip ${state.confirmed ? "status-ok" : ""}`;
  el.monitorSummaryChip.textContent = `${state.members.filter((member) => member.name.trim()).length}명 추적 중`;

  el.monitorStats.innerHTML = `
    <article class="monitor-stat">
      <strong>${overallProgress}%</strong>
      <span>전체 진행률</span>
    </article>
    <article class="monitor-stat">
      <strong>${doing}</strong>
      <span>진행중 작업</span>
    </article>
    <article class="monitor-stat">
      <strong>${counts.blocked}</strong>
      <span>보류 작업</span>
    </article>
    <article class="monitor-stat">
      <strong>${urgentOpen}</strong>
      <span>긴급 미완료</span>
    </article>
  `;

  el.monitorBoard.innerHTML = buckets
    .map((bucket) => {
      const roleText =
        bucket.id === "unassigned"
          ? "아직 담당자가 확정되지 않은 작업입니다."
          : `${memberLabel(bucket)} · ${memberStatusLabel(bucket.status)} · 남은 예상 ${bucket.remainingHours}시간`;

      return `
        <article class="monitor-card ${bucket.id === "unassigned" ? "is-unassigned" : ""}">
          <div class="monitor-card-head">
            <div>
              <h3>${escapeHtml(bucket.name)}</h3>
              <p>${escapeHtml(roleText)}</p>
            </div>
            <div class="monitor-progress-badge">${bucket.progress}%</div>
          </div>
          <div class="monitor-mini-stats">
            <span class="tag neutral">전체 ${bucket.tasks.length}개</span>
            <span class="tag neutral">완료 ${bucket.done}개</span>
            <span class="tag neutral">진행중 ${bucket.doing}개</span>
            <span class="tag ${bucket.blocked ? "warn" : "neutral"}">보류 ${bucket.blocked}개</span>
          </div>
          <div class="monitor-task-list">
            ${
              bucket.tasks.length
                ? bucket.tasks
                    .map(
                      (task) => `
                        <div class="monitor-task ${task.status === "done" ? "is-done" : task.status === "blocked" ? "is-blocked" : ""}">
                          <div class="monitor-task-copy">
                            <strong>${escapeHtml(task.title)}</strong>
                            <p>${escapeHtml(categoryLabel(task.category))} · ${escapeHtml(priorityLabel(task.priority))} · 예상 ${escapeHtml(
                        task.estimatedHours
                      )}시간</p>
                            ${
                              task.waitingOn.length
                                ? `<small>선행 대기: ${escapeHtml(task.waitingOn.map((dependency) => dependency.title).join(", "))}</small>`
                                : task.dependencyTasks.length
                                  ? `<small>의존 작업: ${escapeHtml(task.dependencyTasks.map((dependency) => dependency.title).join(", "))}</small>`
                                  : ""
                            }
                          </div>
                          <div class="monitor-task-side">
                            <select class="monitor-status-select" data-action="monitor-status" data-task-id="${escapeHtml(
                              task.id
                            )}">
                              ${TASK_STATUS_OPTIONS.map(
                                (option) =>
                                  `<option value="${option.value}" ${option.value === task.status ? "selected" : ""}>${option.label}</option>`
                              ).join("")}
                            </select>
                            <button class="small-button" type="button" data-action="open-task" data-task-id="${escapeHtml(
                              task.id
                            )}">배정 보기</button>
                          </div>
                        </div>
                      `
                    )
                    .join("")
                : `<div class="empty-state">아직 배정된 작업이 없습니다.</div>`
            }
          </div>
        </article>
      `;
    })
    .join("");

  el.monitorAlerts.innerHTML = alerts
    .map(
      (alert) => `
        <article class="monitor-alert tone-${escapeHtml(alert.tone)}">
          <strong>${escapeHtml(alert.title)}</strong>
          <ul class="monitor-alert-list">
            ${alert.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
          </ul>
        </article>
      `
    )
    .join("");
}

function renderSharePreview() {
  if (!el.sharePreview) {
    return;
  }
  el.sharePreview.textContent = buildPlanText();
}

function updateHeaderState() {
  const counts = computeCounts();
  const coverage = computeCoverage();
  const mode = state.analysis ? state.apiMode || state.analysis.mode || "local" : openaiHealth.configured ? "idle" : "local";
  const openaiReady = openaiHealth.checked && openaiHealth.configured;
  const fallbackMode = mode === "local-fallback";
  const displayMode = fallbackMode && openaiReady ? state.analysis?.mode || "local" : mode;

  el.nextActionText.textContent = computeNextAction();
  el.taskCountMetric.textContent = String(counts.tasks);
  el.questionCountMetric.textContent = String(counts.questions);
  el.assignmentCoverageMetric.textContent = `${coverage}%`;
  el.questionCountChip.textContent = `${counts.questions}개`;
  el.taskCountChip.textContent = `${counts.tasks}개`;
  el.confirmedChip.textContent = state.confirmed ? "확정됨" : "미확정";
  el.confirmedChip.className = `chip ${state.confirmed ? "status-ok" : ""}`;
  el.modeChip.textContent = modeLabel(displayMode);
  el.analysisModeChip.textContent = modeLabel(state.analysis ? state.analysis.mode : "idle");
  el.analysisSourceChip.textContent = state.analysis
    ? state.analysis.mode === "openai"
      ? `모델: ${state.model}`
      : state.analysis.mode === "local-c"
        ? "C 엔진"
      : "브라우저 규칙"
    : openaiHealth.checked
      ? openaiHealth.configured
        ? "OpenAI 연결 가능"
        : "로컬 규칙"
      : "연결 확인 중";

  if (openaiHealth.checked && !state.analysis) {
    el.apiBadge.textContent = openaiHealth.configured ? `OpenAI 사용 가능 · ${state.model}` : "로컬 규칙 사용";
    el.apiBadge.className = `status-pill ${openaiHealth.configured ? "status-ok" : "status-warn"}`;
  } else if (displayMode === "openai") {
    el.apiBadge.textContent = "OpenAI 분석 완료";
    el.apiBadge.className = "status-pill status-ok";
  } else if (displayMode === "local-c") {
    el.apiBadge.textContent = "C 로컬 분석";
    el.apiBadge.className = "status-pill status-ok";
  } else if (fallbackMode && openaiReady) {
    el.apiBadge.textContent = "OpenAI 사용 가능 · 로컬 규칙 분석";
    el.apiBadge.className = "status-pill status-ok";
  } else if (fallbackMode) {
    el.apiBadge.textContent = "OpenAI 실패 · 로컬 대체";
    el.apiBadge.className = "status-pill status-warn";
  } else if (displayMode === "local") {
    el.apiBadge.textContent = "로컬 규칙 분석";
    el.apiBadge.className = "status-pill status-warn";
  } else {
    el.apiBadge.textContent = "연결 상태 확인 중";
    el.apiBadge.className = "status-pill";
  }

  updateWorkflowState();
  renderSharePreview();
  updateDocumentTitle();
}

function updateWorkflowState() {
  const activeStep = state.screen || getSuggestedScreen();
  document.querySelectorAll(".workflow-step").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.screen === activeStep);
  });
}

function renderAnalysis() {
  if (!state.analysis) {
    el.analysisTitle.textContent = "아직 분석 전입니다";
    el.analysisSummary.textContent =
      "과제 텍스트와 팀원 정보를 입력하면 요구사항, 작업 큐, 추천 배정이 여기에 표시됩니다.";
    el.requirementsList.innerHTML = `<li class="empty-state">분석을 시작하면 요구사항이 정리됩니다.</li>`;
    el.deliverablesList.innerHTML = `<li class="empty-state">분석을 시작하면 제출물이 정리됩니다.</li>`;
    el.constraintsList.innerHTML = `<li class="empty-state">분석을 시작하면 제약 조건이 정리됩니다.</li>`;
    el.warningsList.innerHTML = `<li class="empty-state">분석 전에는 경고가 없습니다.</li>`;
    updateHeaderState();
    return;
  }

  const analysis = state.analysis;
  const warnings = [...(analysis.warnings || [])];
  if (state.warning) {
    warnings.unshift(state.warning);
  }

  el.analysisTitle.textContent = analysis.project.title || "학생 과제";
  el.analysisSummary.textContent = analysis.summary || "요약이 없습니다.";
  el.requirementsList.innerHTML = formatListHTML(
    analysis.requirements,
    "요구사항이 없습니다."
  );
  el.deliverablesList.innerHTML = formatListHTML(
    analysis.deliverables,
    "제출물이 없습니다."
  );
  el.constraintsList.innerHTML = formatListHTML(
    analysis.constraints,
    "제약 조건이 없습니다."
  );
  el.warningsList.innerHTML = formatListHTML(warnings, "경고가 없습니다.");
  updateHeaderState();
}

function renderAll() {
  populateFormFields();
  renderMembers();
  renderAnalysis();
  renderQuestions();
  renderTasks();
  renderAssignments();
  renderMonitoring();
  renderActivity();
  renderSharePreview();
  updateScreenVisibility();
  updateHeaderState();
}

function applyTaskFocus(taskId) {
  const row = document.querySelector(`[data-task-id="${CSS.escape(taskId)}"]`);
  if (row) {
    row.scrollIntoView({ behavior: "smooth", block: "center" });
    row.animate(
      [
        { boxShadow: "0 0 0 rgba(15, 118, 110, 0)", transform: "translateY(0)" },
        { boxShadow: "0 0 0 4px rgba(15, 118, 110, 0.16)", transform: "translateY(-1px)" },
        { boxShadow: "0 0 0 rgba(15, 118, 110, 0)", transform: "translateY(0)" }
      ],
      { duration: 900, easing: "ease-out" }
    );
  }
}

function buildClarificationText() {
  const lines = [];
  const baseText = String(state.clarificationText || "").trim();
  if (baseText) {
    lines.push(baseText);
  }

  const questions = state.analysis?.questions || [];
  questions.forEach((question, index) => {
    const key = questionKey(question, index);
    const answer = String(state.questionAnswers[key] || "").trim();
    if (!answer) {
      return;
    }
    lines.push(`추가 확인 Q${index + 1}`);
    lines.push(`질문: ${question.question}`);
    lines.push(`답변: ${answer}`);
  });

  return lines.join("\n");
}

function collectPayload() {
  return {
    courseName: state.courseName.trim(),
    projectTitle: state.projectTitle.trim(),
    deadline: state.deadline.trim(),
    strategy: state.strategy,
    briefText: state.briefText.trim(),
    clarificationText: buildClarificationText(),
    model: FIXED_OPENAI_MODEL,
    members: state.members.map((member) => ({
      id: member.id,
      name: member.name,
      roles: member.roles,
      status: member.status,
      capacity: member.capacity,
      note: member.note
    }))
  };
}

function applyAnalysisResult(rawAnalysis, apiMode, warning = "") {
  const previousAnalysis = state.analysis;
  const previousLookup = new Map();
  const previousStatusLookup = new Map();

  if (previousAnalysis?.tasks?.length) {
    for (const task of previousAnalysis.tasks) {
      const signature = taskSignature(task);
      previousLookup.set(signature, {
        memberId: state.manualAssignments[task.id] || "",
        memberIdFromAnalysis: memberIdByName(
          getRecommendedAssignmentMap().get(task.id)?.memberName || ""
        )
      });
      previousStatusLookup.set(signature, state.taskStates[task.id] || "todo");
    }
  }

  const analysis = normalizeAnalysis(rawAnalysis);
  state.analysis = analysis;
  state.apiMode = apiMode;
  state.warning = String(warning || "");
  state.confirmed = false;
  state.screen = "analysis";

  const nextManualAssignments = {};
  const nextTaskStates = {};

  for (const task of analysis.tasks) {
    const signature = taskSignature(task);
    const previous = previousLookup.get(signature);
    if (previous?.memberId) {
      nextManualAssignments[task.id] = previous.memberId;
    } else {
      const recommended = analysis.assignments.find((item) => item.taskId === task.id);
      const recommendedId = recommended?.memberId || memberIdByName(recommended?.memberName || "");
      if (recommendedId) {
        nextManualAssignments[task.id] = recommendedId;
      }
    }

    const previousStatus = previousStatusLookup.get(signature);
    if (previousStatus) {
      nextTaskStates[task.id] = previousStatus;
    } else {
      nextTaskStates[task.id] = "todo";
    }
  }

  state.manualAssignments = nextManualAssignments;
  state.taskStates = nextTaskStates;
  saveState();
  renderAnalysis();
  renderQuestions();
  renderTasks();
  renderAssignments();
  renderMonitoring();
  renderActivity();
  updateScreenVisibility();
  updateHeaderState();
  addActivity(
    apiMode === "openai"
      ? "분석 완료"
      : apiMode === "local-c"
        ? "C 분석 완료"
        : apiMode === "local-fallback"
          ? "로컬 대체 분석"
          : "로컬 분석 완료",
    `${analysis.tasks.length}개 작업, ${analysis.questions.length}개 질문, ${computeCoverage()}% 배정률로 정리했습니다.`,
    apiMode === "openai" || apiMode === "local-c" ? "success" : "warn"
  );
}

function buildLocalAnalysis(payload) {
  const combined = [
    payload.courseName,
    payload.projectTitle,
    payload.deadline,
    payload.briefText,
    payload.clarificationText
  ]
    .filter(Boolean)
    .join("\n");
  const lower = combined.toLowerCase();

  const has = (items) => items.some((item) => lower.includes(item));
  const extractDate = () => {
    const iso = combined.match(/(20\d{2})[./-](\d{1,2})[./-](\d{1,2})/);
    if (iso) {
      return `${iso[1]}-${String(iso[2]).padStart(2, "0")}-${String(iso[3]).padStart(2, "0")}`;
    }
    const korean = combined.match(/(\d{1,2})월\s*(\d{1,2})일/);
    if (korean) {
      const year = new Date().getFullYear();
      return `${year}-${String(korean[1]).padStart(2, "0")}-${String(korean[2]).padStart(2, "0")}`;
    }
    return null;
  };

  const hasPresentation = has(["발표", "ppt", "프레젠테이션", "presentation", "발표자료"]);
  const hasReport = has(["보고서", "레포트", "report", "문서"]);
  const hasCode = has(["코드", "구현", "프로그램", "web", "웹", "react", "javascript", "html", "css", "python", "java", "c언어"]);
  const hasResearch = has(["조사", "분석", "리서치", "자료조사", "출처"]);
  const hasDesign = has(["디자인", "ux", "ui", "레이아웃", "표지"]);
  const hasTest = has(["테스트", "검증", "확인", "리뷰"]);
  const validMemberCount = Array.isArray(payload.members)
    ? payload.members.filter((member) => String(member?.name || "").trim()).length
    : 0;

  const deliverables = [];
  if (hasPresentation) {
    deliverables.push("발표자료");
    deliverables.push("발표 대본");
  }
  if (hasReport) {
    deliverables.push("보고서 본문");
  }
  if (hasCode) {
    deliverables.push("구현 코드");
    deliverables.push("실행 확인");
  }
  if (hasResearch) {
    deliverables.push("자료조사 요약");
  }
  if (hasDesign) {
    deliverables.push("디자인 초안");
  }
  if (hasTest) {
    deliverables.push("테스트 결과");
  }
  if (!deliverables.length) {
    deliverables.push("과제 요구사항 정리");
    deliverables.push("실행 계획서");
  }

  const constraints = [];
  const detectedDate = payload.deadline || extractDate();
  if (detectedDate) {
    constraints.push(`마감일 ${detectedDate}`);
  }
  if (/분|minute|min|초/.test(lower)) {
    constraints.push("발표 시간 제한");
  }
  if (/페이지|쪽|page|p\./.test(lower)) {
    constraints.push("분량 제한");
  }
  if (hasCode) {
    const language = ["python", "java", "c언어", "javascript", "react", "html", "css"].find((item) =>
      lower.includes(item)
    );
    if (language) {
      constraints.push(`사용 기술 ${language}`);
    }
  }
  if (!constraints.length) {
    constraints.push("추가 조건 확인 필요");
  }

  const questions = [];
  if (!detectedDate) {
    questions.push({
      question: "마감일이 언제인가요?",
      reason: "작업 순서를 정하고 우선순위를 조절하려면 마감일이 필요합니다.",
      expectedAnswer: "예: 2026-04-12"
    });
  }
  if (hasPresentation && !/\d+\s*분/.test(lower)) {
    questions.push({
      question: "발표 시간은 몇 분인가요?",
      reason: "슬라이드 수와 발표 대본 분량을 맞추기 위해 필요합니다.",
      expectedAnswer: "예: 5분, 7분"
    });
  }
  if (hasCode && !/react|javascript|html|css|python|java|c언어/.test(lower)) {
    questions.push({
      question: "사용할 개발 언어 또는 프레임워크가 정해져 있나요?",
      reason: "구현 담당을 정할 때 팀원 역량과 도구를 맞춰야 합니다.",
      expectedAnswer: "예: React, Python, Java"
    });
  }
  if (hasReport && !/pdf|hwp|docx|pptx/.test(lower)) {
    questions.push({
      question: "최종 제출 형식은 무엇인가요?",
      reason: "문서 담당과 검토 절차를 정하기 위해 필요합니다.",
      expectedAnswer: "예: PDF, HWP, DOCX"
    });
  }

  const templates = [
    {
      title: "요구사항 정리와 범위 확정",
      category: "기획",
      priority: "urgent",
      hours: 1.5,
      notes: "발표, 문서, 구현, 검토 조건을 먼저 정리"
    }
  ];

  if (hasPresentation) {
    templates.push(
      {
        title: "발표 흐름과 도입 문장 작성",
        category: "발표",
        priority: payload.strategy === "presentation" ? "urgent" : "normal",
        hours: 2,
        notes: "문제 제기, 해결, 기대 효과 순으로 구성"
      },
      {
        title: "슬라이드 초안 구성",
        category: "PPT",
        priority: "normal",
        hours: 3,
        notes: "슬라이드 수와 각 장의 핵심 메시지 배치"
      }
    );
  }

  if (hasResearch) {
    templates.push({
      title: "자료 조사와 출처 수집",
      category: "조사",
      priority: "normal",
      hours: 3,
      notes: "핵심 근거와 참고문헌을 먼저 모으기"
    });
  }

  if (hasCode) {
    templates.push(
      {
        title: "핵심 기능 구현",
        category: "개발",
        priority: "urgent",
        hours: 4,
        notes: "실행 가능한 최소 기능부터 구현"
      },
      {
        title: "테스트와 예외 처리",
        category: "검증",
        priority: "normal",
        hours: 2,
        notes: "입력 예외와 실패 케이스 점검"
      }
    );
  }

  if (hasReport) {
    templates.push(
      {
        title: "보고서 본문 작성",
        category: "문서",
        priority: "normal",
        hours: 3,
        notes: "요약, 배경, 방법, 결과, 결론 순서로 구성"
      },
      {
        title: "맞춤법과 형식 교정",
        category: "검토",
        priority: "low",
        hours: 1,
        notes: "표지, 목차, 페이지 번호까지 검토"
      }
    );
  }

  if (hasDesign) {
    templates.push({
      title: "시각 디자인과 표지 정리",
      category: "디자인",
      priority: "normal",
      hours: 2,
      notes: "표지, 강조 색, 레이아웃 통일"
    });
  }

  if (!hasPresentation && !hasReport && !hasCode && !hasResearch && !hasDesign) {
    templates.push(
      {
        title: "세부 과제 쪼개기",
        category: "기획",
        priority: "normal",
        hours: 2,
        notes: "과제를 발표, 문서, 조사, 검증 단위로 나누기"
      },
      {
        title: "팀원 역할 분담",
        category: "배정",
        priority: "normal",
        hours: 1,
        notes: "역할과 마감에 따라 담당자 추천"
      }
    );
  }

  templates.push({
    title: "최종 검토와 제출 체크",
    category: "검토",
    priority: "urgent",
    hours: 1,
    notes: "마감 직전 빠진 항목 확인"
  });

  if (payload.strategy === "speed") {
    templates.sort((a, b) => {
      const score = (item) => (item.priority === "urgent" ? 0 : item.priority === "normal" ? 1 : 2);
      return score(a) - score(b);
    });
  } else if (payload.strategy === "presentation") {
    templates.sort((a, b) => {
      const score = (item) => {
        let value = 0;
        if (item.category === "발표" || item.category === "PPT") value -= 3;
        if (item.priority === "urgent") value -= 2;
        return value;
      };
      return score(a) - score(b);
    });
  }

  const tasks = templates.slice(0, payload.strategy === "speed" ? 5 : 7).map((task, index) =>
    makeTask(
      {
        id: `task_${String(index + 1).padStart(2, "0")}`,
        title: task.title,
        category: task.category,
        priority: task.priority,
        estimatedHours: task.hours,
        notes: task.notes,
        suggestedRole: task.category,
        dependencies: index === 0 ? [] : [`task_${String(index).padStart(2, "0")}`]
      },
      index
    )
  );

  const assignments = assignTasksLocally(tasks, payload.members || [], payload.strategy);
  const summary = `${payload.courseName || "과목명 미입력"}의 ${payload.projectTitle || "학생 과제"}를 기준으로 ${tasks.length}개 작업과 ${assignments.length}개 배정 초안을 만들었습니다. ${
    questions.length ? `추가 확인 질문 ${questions.length}개가 있습니다.` : "추가 확인 질문은 없습니다."
  }`;

  return {
    mode: "local",
    project: {
      title: payload.projectTitle || "학생 과제",
      course: payload.courseName || "과목명 미입력",
      deadline: detectedDate || null,
      objective:
        payload.strategy === "presentation"
          ? "발표 중심의 역할 분담"
          : payload.strategy === "speed"
            ? "빠른 마감 대응"
            : "균형 잡힌 역할 분배"
    },
    summary,
    requirements: [
      "과제 설명을 실행 가능한 작업으로 분해",
      "팀원 역할과 가용 시간 반영",
      "배정 이유를 사람이 이해할 수 있게 설명"
    ],
    deliverables,
    constraints,
    questions,
    tasks,
    assignments,
    nextActions: questions.length
      ? ["질문에 답을 채우고 재분석하세요."]
      : validMemberCount
        ? ["추천 배정을 확인하고 확정하세요."]
        : ["팀원 프로필을 추가하세요."],
    warnings: validMemberCount ? [] : ["팀원 정보가 없어서 자동 배정이 제한됩니다."]
  };
}

function assignTasksLocally(tasks, members, strategy) {
  const normalizedMembers = (members || [])
    .map((member) => makeMember(member))
    .filter((member) => member.name.trim().length > 0);

  if (!normalizedMembers.length) {
    return tasks.map((task) => ({
      taskId: task.id,
      memberId: "",
      memberName: "",
      rationale: "팀원 정보가 없어서 배정 추천을 만들 수 없습니다.",
      confidence: 0.1
    }));
  }

  const loadMap = new Map(normalizedMembers.map((member) => [member.id, 0]));

  return tasks.map((task) => {
    const candidates = normalizedMembers
      .filter((member) => member.status !== "away")
      .map((member) => {
        let score = 0;
        const roles = member.roles.map((role) => role.toLowerCase());
        const taskText = `${task.title} ${task.category} ${task.suggestedRole}`.toLowerCase();

        if (member.status === "available") score += 30;
        if (member.status === "busy") score += 10;
        if (strategy === "speed" && member.status === "available") score += 8;
        if (strategy === "presentation" && roles.some((role) => role.includes("발표") || role.includes("ppt"))) {
          score += 14;
        }
        if (roles.some((role) => taskText.includes(role))) score += 28;
        if (task.category === "발표" && roles.some((role) => role.includes("발표"))) score += 18;
        if (task.category === "PPT" && roles.some((role) => role.includes("ppt") || role.includes("디자인"))) score += 18;
        if (task.category === "개발" && roles.some((role) => role.includes("코드") || role.includes("개발"))) score += 18;
        if (task.category === "조사" && roles.some((role) => role.includes("조사") || role.includes("리서치"))) score += 16;
        if (task.category === "문서" && roles.some((role) => role.includes("문서") || role.includes("정리"))) score += 16;
        if (task.category === "검토" && roles.some((role) => role.includes("검토") || role.includes("교정"))) score += 16;

        const currentLoad = loadMap.get(member.id) || 0;
        score += Math.max(0, member.capacity - currentLoad) * 4;
        score -= currentLoad * 3;

        return { member, score };
      })
      .sort((a, b) => b.score - a.score);

    const chosen = candidates[0]?.member || normalizedMembers[0];
    loadMap.set(chosen.id, (loadMap.get(chosen.id) || 0) + 1);

    const bestScore = candidates[0]?.score ?? 20;
    const confidence = Math.max(0.15, Math.min(0.98, bestScore / 60));

    return {
      taskId: task.id,
      memberId: chosen.id,
      memberName: chosen.name,
      rationale: `${chosen.name} 님의 역할 태그와 현재 가용성을 기준으로 가장 무난한 배정입니다.`,
      confidence: Number(confidence.toFixed(2))
    };
  });
}

async function callOpenAI(payload) {
  const response = await fetch("/api/analyze", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || "분석 요청에 실패했습니다.");
  }

  return data;
}

function mergeSavedStateWithCurrentState() {
  saveState();
  updateHeaderState();
}

async function analyzeBrief(reason = "manual") {
  const payload = collectPayload();
  if (!payload.briefText && !payload.projectTitle) {
    addActivity("입력 필요", "과제 텍스트 또는 프로젝트명을 먼저 입력하세요.", "warn");
    return;
  }

  el.analyzeButton.disabled = true;
  el.reanalyzeButton.disabled = true;
  el.recalculateButton.disabled = true;
  el.apiBadge.textContent = "분석 중...";
  el.apiBadge.className = "status-pill";

  try {
    const result = await callOpenAI(payload);
    applyAnalysisResult(result.analysis, result.apiMode || "local", result.warning || "");
  } catch (error) {
    const localAnalysis = buildLocalAnalysis(payload);
    applyAnalysisResult(localAnalysis, "local-fallback", error.message || "OpenAI 연결 실패");
  } finally {
    el.analyzeButton.disabled = false;
    el.reanalyzeButton.disabled = false;
    el.recalculateButton.disabled = false;
    saveState();
    updateHeaderState();
    if (reason === "manual") {
      mergeSavedStateWithCurrentState();
    }
  }
}

function handleFormInput(event) {
  const { id, value } = event.target;
  if (id === "courseNameInput") state.courseName = value;
  if (id === "projectTitleInput") state.projectTitle = value;
  if (id === "deadlineInput") state.deadline = value;
  if (id === "strategySelect") state.strategy = value;
  if (id === "briefTextInput") state.briefText = value;
  if (id === "clarificationInput") state.clarificationText = value;
  saveState();
  updateHeaderState();
}

function handleMemberInput(event) {
  const row = event.target.closest(".member-row");
  if (!row) return;
  const member = state.members.find((item) => item.id === row.dataset.memberId);
  if (!member || !event.target.matches("[data-field]")) return;

  const field = event.target.dataset.field;
  if (field === "name") member.name = event.target.value;
  if (field === "roles") member.roles = splitRoles(event.target.value);
  if (field === "status") member.status = event.target.value;
  if (field === "capacity") member.capacity = clampNumber(event.target.value, 1, 8, member.capacity || 2);
  if (field === "note") member.note = event.target.value;
  saveState();
  updateHeaderState();
}

function rerenderTaskDependentSections() {
  renderMembers();
  renderQuestions();
  renderTasks();
  renderAssignments();
  renderMonitoring();
  renderActivity();
  updateHeaderState();
}

function handleMemberChange(event) {
  const row = event.target.closest(".member-row");
  if (!row) return;
  if (!event.target.matches("[data-field]")) return;
  saveState();
  rerenderTaskDependentSections();
}

function handleMemberClick(event) {
  const button = event.target.closest("[data-action='remove-member']");
  if (!button) return;
  const row = button.closest(".member-row");
  if (!row) return;
  const memberId = row.dataset.memberId;
  state.members = state.members.filter((member) => member.id !== memberId);
  for (const taskId of Object.keys(state.manualAssignments)) {
    if (state.manualAssignments[taskId] === memberId) {
      delete state.manualAssignments[taskId];
    }
  }
  saveState();
  rerenderTaskDependentSections();
}

function handleTaskInput(event) {
  const row = event.target.closest(".task-row");
  if (!row || !event.target.matches("[data-field]")) return;
  const task = state.analysis?.tasks?.find((item) => item.id === row.dataset.taskId);
  if (!task) return;

  const field = event.target.dataset.field;
  if (field === "title") task.title = event.target.value;
  if (field === "category") task.category = event.target.value;
  if (field === "priority") task.priority = event.target.value;
  if (field === "estimatedHours") task.estimatedHours = clampNumber(event.target.value, 0.5, 24, task.estimatedHours || 1);
  if (field === "assigned") state.manualAssignments[task.id] = event.target.value;
  if (field === "status") state.taskStates[task.id] = event.target.value;
  saveState();
  renderMonitoring();
  updateHeaderState();
}

function handleTaskChange(event) {
  const row = event.target.closest(".task-row");
  if (!row || !event.target.matches("[data-field]")) return;
  const task = state.analysis?.tasks?.find((item) => item.id === row.dataset.taskId);
  if (!task) return;
  const field = event.target.dataset.field;
  if (field === "title") task.title = event.target.value;
  if (field === "category") task.category = event.target.value;
  if (field === "priority") task.priority = event.target.value;
  if (field === "estimatedHours") task.estimatedHours = clampNumber(event.target.value, 0.5, 24, task.estimatedHours || 1);
  if (field === "assigned") {
    state.manualAssignments[task.id] = event.target.value;
  }
  if (field === "status") {
    state.taskStates[task.id] = event.target.value;
  }
  saveState();
  renderTasks();
  renderAssignments();
  renderMonitoring();
  updateHeaderState();
}

function handleQuestionInput(event) {
  const input = event.target;
  if (!input.matches(".answer-input")) return;
  const key = input.dataset.questionKey;
  state.questionAnswers[key] = input.value;
  saveState();
  updateHeaderState();
}

function clearQuestionAnswers() {
  state.questionAnswers = {};
  saveState();
  renderQuestions();
  updateHeaderState();
  addActivity("질문 답변 초기화", "질문 큐의 답변을 모두 지웠습니다.", "neutral");
}

function addMember() {
  state.members.push(
    makeMember({
      id: createId("member"),
      name: "",
      roles: [],
      status: "available",
      capacity: 2,
      note: ""
    })
  );
  saveState();
  rerenderTaskDependentSections();
  addActivity("팀원 추가", "새로운 팀원 입력 행을 추가했습니다.", "neutral");
}

function loadSample() {
  state = createSampleState();
  saveState();
  renderAll();
  addActivity("샘플 로드", "예시 과제와 팀원 프로필을 불러왔습니다.", "neutral");
  analyzeBrief("sample");
}

function resetWorkspace() {
  const confirmed = window.confirm("작성 중인 내용을 모두 초기화할까요?");
  if (!confirmed) {
    return;
  }
  state = createBlankState();
  window.localStorage.removeItem(STORAGE_KEY);
  state.screen = "intake";
  renderAll();
  addActivity("초기화", "작업 공간을 빈 상태로 되돌렸습니다.", "neutral");
}

function copyText(value, successTitle, successDetail) {
  const text = String(value || "").trim();
  if (!text) {
    addActivity("복사 실패", "복사할 내용이 없습니다.", "warn");
    return;
  }

  if (navigator.clipboard?.writeText) {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        addActivity(successTitle, successDetail, "success");
      })
      .catch(() => fallbackCopy(text, successTitle, successDetail));
    return;
  }

  fallbackCopy(text, successTitle, successDetail);
}

function fallbackCopy(text, successTitle, successDetail) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "absolute";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand("copy");
    addActivity(successTitle, successDetail, "success");
  } catch {
    addActivity("복사 실패", "브라우저에서 복사를 허용하지 않았습니다.", "warn");
  } finally {
    textarea.remove();
  }
}

function buildSummaryText() {
  if (!state.analysis) {
    return [
      `프로젝트: ${state.projectTitle || "미입력"}`,
      `과목: ${state.courseName || "미입력"}`,
      `마감일: ${state.deadline || "미입력"}`,
      "",
      state.briefText.trim()
    ]
      .filter(Boolean)
      .join("\n");
  }

  const lines = [
    `프로젝트: ${state.analysis.project.title}`,
    `과목: ${state.analysis.project.course}`,
    `마감일: ${state.analysis.project.deadline || state.deadline || "미입력"}`,
    `분석 모드: ${modeLabel(state.analysis.mode)}`,
    "",
    `요약: ${state.analysis.summary}`,
    "",
    "요구사항:",
    ...(state.analysis.requirements.length ? state.analysis.requirements.map((item) => `- ${item}`) : ["- 없음"]),
    "",
    "제출물:",
    ...(state.analysis.deliverables.length ? state.analysis.deliverables.map((item) => `- ${item}`) : ["- 없음"]),
    "",
    "질문:",
    ...(state.analysis.questions.length
      ? state.analysis.questions.map((question, index) => {
          const key = questionKey(question, index);
          const answer = String(state.questionAnswers[key] || "").trim();
          return `- ${question.question}${answer ? ` / 답변: ${answer}` : ""}`;
        })
      : ["- 없음"])
  ];

  return lines.join("\n");
}

function buildPlanText() {
  if (!state.analysis) {
    return buildSummaryText();
  }

  const recommendations = getRecommendedAssignmentMap();
  const lines = [
    `# ${state.analysis.project.title}`,
    `과목: ${state.analysis.project.course}`,
    `마감일: ${state.analysis.project.deadline || state.deadline || "미입력"}`,
    `요약: ${state.analysis.summary}`,
    "",
    "## 작업 큐"
  ];

  for (const [index, task] of (state.analysis.tasks || []).entries()) {
    const recommended = recommendations.get(task.id);
    const currentMemberId = getCurrentAssignmentMemberId(task.id);
    const currentMemberName = memberDisplayName(currentMemberId) || "미배정";
    const status = statusLabel(getCurrentTaskStatus(task.id));
    lines.push(
      `${index + 1}. ${task.title} [${task.category}, ${priorityLabel(task.priority)}, ${task.estimatedHours}h]`,
      `   담당: ${currentMemberName}`,
      `   상태: ${status}`,
      `   추천: ${recommended?.memberName || "미정"}`
    );
    if (recommended?.rationale) {
      lines.push(`   이유: ${recommended.rationale}`);
    }
  }

  if (state.analysis.questions.length) {
    lines.push("", "## 질문");
    state.analysis.questions.forEach((question, index) => {
      const key = questionKey(question, index);
      const answer = String(state.questionAnswers[key] || "").trim();
      lines.push(`- ${question.question}${answer ? ` / 답변: ${answer}` : ""}`);
    });
  }

  return lines.join("\n");
}

function openTaskInReview(taskId) {
  setScreen("review", { scroll: true });
  requestAnimationFrame(() => applyTaskFocus(taskId));
}

async function fetchHealth() {
  try {
    const response = await fetch("/api/health");
    if (!response.ok) {
      throw new Error("health check failed");
    }
    const data = await response.json();
    openaiHealth.checked = true;
    openaiHealth.configured = Boolean(data.openaiConfigured);
  } catch {
    openaiHealth.checked = true;
    openaiHealth.configured = false;
  } finally {
    updateHeaderState();
  }
}

function bindEvents() {
  document.querySelectorAll("button[data-screen]").forEach((button) => {
    button.addEventListener("click", () => {
      setScreen(button.dataset.screen);
    });
  });

  document.querySelectorAll("[data-nav]").forEach((button) => {
    button.addEventListener("click", () => {
      setScreen(button.dataset.nav);
    });
  });

  el.courseNameInput.addEventListener("input", handleFormInput);
  el.projectTitleInput.addEventListener("input", handleFormInput);
  el.deadlineInput.addEventListener("input", handleFormInput);
  el.strategySelect.addEventListener("change", handleFormInput);
  el.briefTextInput.addEventListener("input", handleFormInput);
  el.clarificationInput.addEventListener("input", handleFormInput);

  el.addMemberButton.addEventListener("click", addMember);
  el.loadSampleButton.addEventListener("click", loadSample);
  el.resetButton.addEventListener("click", resetWorkspace);
  el.analyzeButton.addEventListener("click", () => analyzeBrief("manual"));
  el.reanalyzeButton.addEventListener("click", () => analyzeBrief("manual"));
  el.recalculateButton.addEventListener("click", () => analyzeBrief("manual"));
  el.clearAnswersButton.addEventListener("click", clearQuestionAnswers);
  el.confirmAllButton.addEventListener("click", () => {
    if (!state.analysis?.tasks?.length) {
      addActivity("확정 불가", "먼저 분석을 실행해야 배정을 확정할 수 있습니다.", "warn");
      return;
    }
    state.confirmed = true;
    state.screen = "share";
    saveState();
    updateHeaderState();
    renderAssignments();
    renderMonitoring();
    updateScreenVisibility();
    addActivity("배정 확정", "추천 배정을 확정하고 진행 보드에 반영했습니다.", "success");
  });
  el.copySummaryButton.addEventListener("click", () =>
    copyText(buildSummaryText(), "요약 복사", "팀톡에 붙여넣을 수 있는 요약을 복사했습니다.")
  );
  el.exportPlanButton.addEventListener("click", () =>
    copyText(buildPlanText(), "계획 복사", "작업 큐와 배정 초안을 복사했습니다.")
  );

  el.membersList.addEventListener("input", handleMemberInput);
  el.membersList.addEventListener("change", handleMemberChange);
  el.membersList.addEventListener("click", handleMemberClick);

  el.tasksList.addEventListener("input", handleTaskInput);
  el.tasksList.addEventListener("change", handleTaskChange);

  el.questionsList.addEventListener("input", handleQuestionInput);

  el.assignmentList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action='focus-task']");
    if (!button) return;
    applyTaskFocus(button.dataset.taskId);
  });

  if (el.monitorBoard) {
    el.monitorBoard.addEventListener("change", (event) => {
      const select = event.target.closest("[data-action='monitor-status']");
      if (!select) return;
      const taskId = select.dataset.taskId;
      const task = state.analysis?.tasks?.find((item) => item.id === taskId);
      if (!task) return;
      state.taskStates[taskId] = select.value;
      saveState();
      renderTasks();
      renderAssignments();
      renderMonitoring();
      updateHeaderState();
      addActivity("모니터링 업데이트", `${task.title} 상태를 ${statusLabel(select.value)}로 변경했습니다.`, "neutral");
    });

    el.monitorBoard.addEventListener("click", (event) => {
      const button = event.target.closest("[data-action='open-task']");
      if (!button) return;
      openTaskInReview(button.dataset.taskId);
    });
  }

  document.addEventListener("click", (event) => {
    const resetButton = event.target.closest("[data-action='reset-workspace']");
    if (resetButton) {
      resetWorkspace();
    }
  });
}

function initialize() {
  renderAll();
  bindEvents();
  requestAnimationFrame(() => document.body.classList.add("loaded"));
  fetchHealth();
}

initialize();

const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const { URL } = require("url");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const contents = fs.readFileSync(filePath, "utf8");
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, equalsIndex).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }

    let value = trimmed.slice(equalsIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFile(path.join(__dirname, ".env.local"));
loadEnvFile(path.join(__dirname, ".env"));

const PORT = Number(process.env.PORT || 3000);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const FIXED_OPENAI_MODEL = "gpt-4o-mini";
const ROOT = __dirname;
const LOCAL_ENGINE_SOURCE = path.join(ROOT, "teamqueue_engine.c");
const LOCAL_ENGINE_BINARY = path.join(ROOT, "teamqueue_engine");

function isAsciiString(value) {
  return /^[\x00-\x7F]*$/.test(String(value ?? ""));
}

function getOpenAIConfigWarning(apiKey) {
  if (apiKey && !isAsciiString(apiKey)) {
    return "OPENAI_API_KEY에 ASCII 이외의 문자가 포함되어 있습니다. 키를 다시 붙여넣어 주세요.";
  }

  return "";
}

function encodeLocalEngineField(value) {
  return Buffer.from(String(value ?? ""), "utf8").toString("base64");
}

function serializeLocalEngineInput(input) {
  const lines = [
    `courseName=${encodeLocalEngineField(input.courseName)}`,
    `projectTitle=${encodeLocalEngineField(input.projectTitle)}`,
    `deadline=${encodeLocalEngineField(input.deadline)}`,
    `strategy=${encodeLocalEngineField(input.strategy)}`,
    `briefText=${encodeLocalEngineField(input.briefText)}`,
    `clarificationText=${encodeLocalEngineField(input.clarificationText)}`
  ];

  const members = Array.isArray(input.members) ? input.members : [];
  lines.push(`members=${members.length}`);
  for (const member of members) {
    const roles = Array.isArray(member.roles) ? member.roles.join(",") : String(member.roles || "");
    lines.push(
      `member=${[
        encodeLocalEngineField(member.name),
        encodeLocalEngineField(roles),
        encodeLocalEngineField(member.status),
        String(member.capacity || 0),
        encodeLocalEngineField(member.note)
      ].join("|")}`
    );
  }

  return `${lines.join("\n")}\n`;
}

function ensureLocalEngineBinary() {
  if (!fs.existsSync(LOCAL_ENGINE_SOURCE)) {
    throw new Error("C 로컬 엔진 소스 파일을 찾을 수 없습니다.");
  }

  const binaryExists = fs.existsSync(LOCAL_ENGINE_BINARY);
  if (binaryExists) {
    const sourceStat = fs.statSync(LOCAL_ENGINE_SOURCE);
    const binaryStat = fs.statSync(LOCAL_ENGINE_BINARY);
    if (binaryStat.mtimeMs >= sourceStat.mtimeMs) {
      return;
    }
  }

  const compiler = process.env.CC || "cc";
  const result = spawnSync(compiler, ["-std=c11", "-O2", LOCAL_ENGINE_SOURCE, "-o", LOCAL_ENGINE_BINARY], {
    cwd: ROOT,
    encoding: "utf8"
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const message = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(message || "C 로컬 엔진 컴파일에 실패했습니다.");
  }
}

function callLocalEngine(input) {
  return new Promise((resolve, reject) => {
    try {
      ensureLocalEngineBinary();
    } catch (error) {
      reject(error);
      return;
    }

    const child = spawn(LOCAL_ENGINE_BINARY, [], { cwd: ROOT });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `C 로컬 엔진이 코드 ${code}로 종료되었습니다.`));
        return;
      }

      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(new Error(`C 로컬 엔진의 JSON 응답을 읽지 못했습니다: ${error.message}`));
      }
    });

    child.stdin.end(serializeLocalEngineInput(input));
  });
}

const OPENAI_CONFIG_WARNING = getOpenAIConfigWarning(OPENAI_API_KEY);
const OPENAI_ENABLED = Boolean(OPENAI_API_KEY) && !OPENAI_CONFIG_WARNING;

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8"
};

const ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "mode",
    "project",
    "summary",
    "requirements",
    "deliverables",
    "constraints",
    "questions",
    "tasks",
    "assignments",
    "nextActions",
    "warnings"
  ],
  properties: {
    mode: { type: "string" },
    project: {
      type: "object",
      additionalProperties: false,
      required: ["title", "course", "deadline", "objective"],
      properties: {
        title: { type: "string" },
        course: { type: "string" },
        deadline: { type: ["string", "null"] },
        objective: { type: "string" }
      }
    },
    summary: { type: "string" },
    requirements: { type: "array", items: { type: "string" } },
    deliverables: { type: "array", items: { type: "string" } },
    constraints: { type: "array", items: { type: "string" } },
    questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["question", "reason", "expectedAnswer"],
        properties: {
          question: { type: "string" },
          reason: { type: "string" },
          expectedAnswer: { type: "string" }
        }
      }
    },
    tasks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "title",
          "category",
          "priority",
          "estimatedHours",
          "notes",
          "suggestedRole",
          "dependencies"
        ],
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          category: { type: "string" },
          priority: { type: "string", enum: ["urgent", "normal", "low"] },
          estimatedHours: { type: "number" },
          notes: { type: "string" },
          suggestedRole: { type: "string" },
          dependencies: { type: "array", items: { type: "string" } }
        }
      }
    },
    assignments: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["taskId", "memberName", "rationale", "confidence"],
        properties: {
          taskId: { type: "string" },
          memberName: { type: ["string", "null"] },
          rationale: { type: "string" },
          confidence: { type: "number" }
        }
      }
    },
    nextActions: { type: "array", items: { type: "string" } },
    warnings: { type: "array", items: { type: "string" } }
  }
};

const SYSTEM_PROMPT = [
  "You help Korean university students turn a pasted assignment brief into a practical team plan.",
  "Return only JSON that matches the provided schema.",
  "Do not add markdown, code fences, or commentary.",
  "Use the provided team members, their roles, statuses, and capacities to recommend owners.",
  "Sequence tasks as a queue from the most urgent and blocking work to the least urgent.",
  "If information is missing, ask a small number of focused clarification questions.",
  "Keep task titles concrete and actionable.",
  "Confidence must be between 0 and 1.",
  "Prefer 4-8 tasks unless the brief clearly needs more."
].join(" ");

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function sendText(res, statusCode, text, contentType = "text/plain; charset=utf-8") {
  res.writeHead(statusCode, {
    "Content-Type": contentType,
    "Content-Length": Buffer.byteLength(text)
  });
  res.end(text);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => {
      chunks.push(chunk);
      if (Buffer.concat(chunks).length > 1_000_000) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function serveStatic(req, res, pathname) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(ROOT, safePath));

  if (!filePath.startsWith(ROOT)) {
    sendText(res, 403, "Forbidden");
    return true;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return false;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";
  const data = fs.readFileSync(filePath);

  res.writeHead(200, {
    "Content-Type": contentType,
    "Content-Length": data.length
  });
  res.end(data);
  return true;
}

function normalizeMembers(rawMembers) {
  if (!Array.isArray(rawMembers)) {
    return [];
  }

  return rawMembers
    .map((member, index) => ({
      id: String(member.id || `member_${index + 1}`),
      name: String(member.name || `팀원 ${index + 1}`),
      roles: Array.isArray(member.roles)
        ? member.roles.map((role) => String(role).trim()).filter(Boolean)
        : String(member.roles || "")
            .split(",")
            .map((role) => role.trim())
            .filter(Boolean),
      status: ["available", "busy", "away"].includes(member.status) ? member.status : "available",
      capacity: Number.isFinite(Number(member.capacity)) ? Math.max(1, Number(member.capacity)) : 2,
      note: String(member.note || "")
    }))
    .filter((member) => member.name.trim().length > 0);
}

function normalizePayload(payload) {
  const briefText = String(payload.briefText || "").trim();
  const projectTitle = String(payload.projectTitle || "").trim();
  const courseName = String(payload.courseName || "").trim();
  const deadline = String(payload.deadline || "").trim();
  const strategy = ["balanced", "speed", "presentation"].includes(payload.strategy)
    ? payload.strategy
    : "balanced";

  return {
    courseName,
    projectTitle,
    deadline,
    strategy,
    briefText,
    clarificationText: String(payload.clarificationText || "").trim(),
    model: FIXED_OPENAI_MODEL,
    members: normalizeMembers(payload.members)
  };
}

function asKeywords(text) {
  return text
    .split(/[\n,.;:!?(){}\[\]<>/\\|-]+/g)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 18);
}

function detectDate(text) {
  const match = text.match(/(\d{2,4})[.\/-](\d{1,2})[.\/-](\d{1,2})/);
  if (!match) {
    return null;
  }

  const year = match[1].length === 2 ? `20${match[1]}` : match[1];
  const month = match[2].padStart(2, "0");
  const day = match[3].padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function hasAny(text, list) {
  return list.some((item) => text.includes(item));
}

function createTaskId(index) {
  return `task_${String(index + 1).padStart(2, "0")}`;
}

function buildLocalAnalysis(input) {
  const brief = [input.courseName, input.projectTitle, input.deadline, input.briefText, input.clarificationText]
    .filter(Boolean)
    .join("\n");
  const lower = brief.toLowerCase();
  const keywords = asKeywords(brief);

  const hasPresentation = hasAny(lower, ["발표", "ppt", "프레젠테이션", "presentation", "발표자료"]);
  const hasReport = hasAny(lower, ["보고서", "레포트", "report", "문서"]);
  const hasCode = hasAny(lower, ["코드", "구현", "프로그램", "python", "java", "c언어", "javascript", "react"]);
  const hasResearch = hasAny(lower, ["조사", "분석", "자료조사", "리서치", "reference", "출처"]);
  const hasDesign = hasAny(lower, ["디자인", "시각", "레이아웃", "ui", "ux", "표지"]);
  const hasTest = hasAny(lower, ["테스트", "검증", "리뷰", "교정", "확인"]);

  const deliverables = [];
  if (hasPresentation) {
    deliverables.push("발표자료");
    deliverables.push("발표 스크립트");
  }
  if (hasReport) {
    deliverables.push("보고서 본문");
  }
  if (hasCode) {
    deliverables.push("기능 구현 코드");
    deliverables.push("실행 확인 또는 테스트");
  }
  if (hasResearch) {
    deliverables.push("조사 요약 및 출처 정리");
  }
  if (hasDesign) {
    deliverables.push("표지 또는 시각 디자인");
  }
  if (hasTest) {
    deliverables.push("최종 검토");
  }
  if (!deliverables.length) {
    deliverables.push("과제 요구사항 해석");
    deliverables.push("실행 계획서");
  }

  const constraints = [];
  if (input.deadline) {
    constraints.push(`마감일 ${input.deadline}`);
  }
  if (/분|minute|min|초/.test(lower)) {
    constraints.push("발표 시간 제한");
  }
  if (/페이지|쪽|page|p\./.test(lower)) {
    constraints.push("분량 제한");
  }
  if (hasCode && /python|java|c|javascript|typescript|react|html|css/.test(lower)) {
    const language = ["python", "java", "c언어", "javascript", "typescript", "react", "html", "css"].find((item) =>
      lower.includes(item)
    );
    if (language) {
      constraints.push(`사용 기술 ${language}`);
    }
  }
  if (!constraints.length) {
    constraints.push("추가 조건 확인 필요");
  }

  const requirements = [
    "과제 설명을 실행 가능한 작업으로 분해",
    "팀원 역할과 가용 시간 반영",
    "배정 이유를 사람이 이해할 수 있게 설명"
  ];

  const questions = [];
  if (!input.deadline && !detectDate(brief)) {
    questions.push({
      question: "마감일이 언제인가요?",
      reason: "배정 우선순위와 일감 순서를 정하려면 마감일이 필요합니다.",
      expectedAnswer: "YYYY-MM-DD 형식 또는 제출 시각"
    });
  }
  if (hasPresentation && !/(\d+)\s*분/.test(lower)) {
    questions.push({
      question: "발표 시간은 몇 분인가요?",
      reason: "발표 슬라이드와 대본 분량을 조정하기 위해 필요합니다.",
      expectedAnswer: "예: 5분, 7분"
    });
  }
  if (hasCode && !/python|java|c언어|javascript|typescript|react|html|css/.test(lower)) {
    questions.push({
      question: "사용할 개발 언어 또는 프레임워크가 정해져 있나요?",
      reason: "구현 담당을 정할 때 팀원 역량과 도구를 맞춰야 합니다.",
      expectedAnswer: "예: Python, Java, React"
    });
  }
  if (hasReport && !/pdf|hwp|docx|pptx/.test(lower)) {
    questions.push({
      question: "최종 제출 형식은 무엇인가요?",
      reason: "문서 담당과 검토 절차를 정하기 위해 필요합니다.",
      expectedAnswer: "예: PDF, HWP, DOCX"
    });
  }

  const taskTemplates = [
    {
      title: "요구사항 정리와 범위 확정",
      category: "기획",
      priority: "urgent",
      hours: 1.5,
      notes: "발표 여부, 제출물, 분량, 금지사항을 먼저 정리"
    }
  ];

  if (hasPresentation) {
    taskTemplates.push(
      {
        title: "발표 흐름과 도입 문장 작성",
        category: "발표",
        priority: input.strategy === "presentation" ? "urgent" : "normal",
        hours: 2,
        notes: "도입-문제-해결-기대효과 순서로 스토리 구성"
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
    taskTemplates.push({
      title: "자료 조사와 출처 수집",
      category: "조사",
      priority: "normal",
      hours: 3,
      notes: "핵심 근거와 참고문헌을 먼저 모으기"
    });
  }

  if (hasCode) {
    taskTemplates.push(
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
    taskTemplates.push(
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
    taskTemplates.push({
      title: "시각 디자인과 표지 정리",
      category: "디자인",
      priority: "normal",
      hours: 2,
      notes: "표지, 강조 색, 레이아웃 통일"
    });
  }

  if (!hasPresentation && !hasReport && !hasCode && !hasResearch && !hasDesign) {
    taskTemplates.push(
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

  taskTemplates.push({
    title: "최종 검토와 제출 체크",
    category: "검토",
    priority: "urgent",
    hours: 1,
    notes: "마감 직전 빠진 항목을 확인"
  });

  if (input.strategy === "speed") {
    taskTemplates.sort((a, b) => (a.priority === "urgent" ? -1 : 1) - (b.priority === "urgent" ? -1 : 1));
  } else if (input.strategy === "presentation") {
    taskTemplates.sort((a, b) => {
      const score = (item) => (item.category === "발표" || item.category === "PPT" ? -2 : 0) + (item.priority === "urgent" ? -1 : 0);
      return score(a) - score(b);
    });
  }

  const tasks = taskTemplates.slice(0, input.strategy === "speed" ? 5 : 7).map((task, index) => ({
    id: createTaskId(index),
    title: task.title,
    category: task.category,
    priority: task.priority,
    estimatedHours: task.hours,
    notes: task.notes,
    suggestedRole: task.category,
    dependencies: index === 0 ? [] : [createTaskId(index - 1)]
  }));

  const assignments = assignTasksLocally(tasks, input.members, input.strategy);
  const summary = buildSummary(input, tasks, assignments, questions);
  const nextActions = [];
  if (questions.length) {
    nextActions.push("질문에 답을 채우고 재분석하세요.");
  }
  if (input.members.length === 0) {
    nextActions.push("팀원 프로필을 추가하세요.");
  } else if (tasks.length > 0) {
    nextActions.push("추천 배정을 확인하고 확정하세요.");
  }
  if (!nextActions.length) {
    nextActions.push("배정 결과를 확정하고 공유하세요.");
  }

  return {
    mode: "local",
    project: {
      title: input.projectTitle || "학생 과제",
      course: input.courseName || "과목명 미입력",
      deadline: input.deadline || detectDate(brief),
      objective: input.strategy === "presentation"
        ? "발표 중심의 역할 분담"
        : input.strategy === "speed"
          ? "빠른 마감 대응"
          : "균형 잡힌 역할 분배"
    },
    summary,
    requirements,
    deliverables,
    constraints,
    questions,
    tasks,
    assignments,
    nextActions,
    warnings: input.members.length === 0 ? ["팀원 정보가 없어서 자동 배정은 제한됩니다."] : []
  };
}

function assignTasksLocally(tasks, members, strategy) {
  if (!members.length) {
    return tasks.map((task) => ({
      taskId: task.id,
      memberName: null,
      rationale: "팀원 정보가 없어서 배정 추천을 만들 수 없습니다.",
      confidence: 0.08
    }));
  }

  const loadMap = new Map(members.map((member) => [member.id, 0]));

  return tasks.map((task) => {
    const best = members
      .filter((member) => member.status !== "away")
      .map((member) => {
        let score = 0;
        const roles = member.roles.map((role) => role.toLowerCase());
        const taskText = `${task.title} ${task.category} ${task.suggestedRole}`.toLowerCase();

        if (member.status === "available") score += 30;
        if (member.status === "busy") score += 10;
        if (strategy === "speed" && member.status === "available") score += 8;
        if (strategy === "presentation" && roles.some((role) => role.includes("발표") || role.includes("ppt"))) score += 14;
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

    const chosen = best[0]?.member || members[0];
    loadMap.set(chosen.id, (loadMap.get(chosen.id) || 0) + 1);

    const confidence = Math.max(0.18, Math.min(0.98, (best[0]?.score || 24) / 60));
    return {
      taskId: task.id,
      memberName: chosen.name,
      rationale: `${chosen.name} 님의 역할 태그와 현재 가용성을 기준으로 가장 무난한 배정입니다.`,
      confidence: Number(confidence.toFixed(2))
    };
  });
}

function buildSummary(input, tasks, assignments, questions) {
  const title = input.projectTitle || "학생 과제";
  const course = input.courseName || "과목명 미입력";
  const taskCount = tasks.length;
  const memberCount = input.members.length;
  const questionText = questions.length ? `추가 확인 질문 ${questions.length}개가 있습니다.` : "추가 확인 질문은 없습니다.";
  return `${course}의 ${title}을(를) 기준으로 ${taskCount}개 작업을 분해하고 ${memberCount}명에게 배정 초안을 만들었습니다. ${questionText}`;
}

async function callOpenAI(input) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: FIXED_OPENAI_MODEL,
      temperature: 0.2,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: JSON.stringify({
            courseName: input.courseName,
            projectTitle: input.projectTitle,
            deadline: input.deadline,
            strategy: input.strategy,
            briefText: input.briefText,
            clarificationText: input.clarificationText,
            members: input.members
          })
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "assignment_planner",
          strict: true,
          schema: ANALYSIS_SCHEMA
        }
      }
    })
  });

  const data = await response.json();
  if (!response.ok) {
    const message = data?.error?.message || `OpenAI request failed with status ${response.status}`;
    throw new Error(message);
  }

  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI returned an empty response.");
  }

  const parsed = JSON.parse(content);
  return normalizeOpenAIAnalysis(parsed);
}

function normalizeOpenAIAnalysis(analysis) {
  return {
    mode: "openai",
    project: {
      title: String(analysis.project?.title || "학생 과제"),
      course: String(analysis.project?.course || "과목명 미입력"),
      deadline: analysis.project?.deadline || null,
      objective: String(analysis.project?.objective || "")
    },
    summary: String(analysis.summary || ""),
    requirements: Array.isArray(analysis.requirements) ? analysis.requirements.map(String) : [],
    deliverables: Array.isArray(analysis.deliverables) ? analysis.deliverables.map(String) : [],
    constraints: Array.isArray(analysis.constraints) ? analysis.constraints.map(String) : [],
    questions: Array.isArray(analysis.questions)
      ? analysis.questions.map((item) => ({
          question: String(item.question || ""),
          reason: String(item.reason || ""),
          expectedAnswer: String(item.expectedAnswer || "")
        }))
      : [],
    tasks: Array.isArray(analysis.tasks)
      ? analysis.tasks.map((item, index) => ({
          id: String(item.id || createTaskId(index)),
          title: String(item.title || `업무 ${index + 1}`),
          category: String(item.category || "기획"),
          priority: ["urgent", "normal", "low"].includes(item.priority) ? item.priority : "normal",
          estimatedHours: Number(item.estimatedHours || 1),
          notes: String(item.notes || ""),
          suggestedRole: String(item.suggestedRole || item.category || "기획"),
          dependencies: Array.isArray(item.dependencies) ? item.dependencies.map(String) : []
        }))
      : [],
    assignments: Array.isArray(analysis.assignments)
      ? analysis.assignments.map((item) => ({
          taskId: String(item.taskId || ""),
          memberName: item.memberName ? String(item.memberName) : null,
          rationale: String(item.rationale || ""),
          confidence: Number(item.confidence || 0.5)
        }))
      : [],
    nextActions: Array.isArray(analysis.nextActions) ? analysis.nextActions.map(String) : [],
    warnings: Array.isArray(analysis.warnings) ? analysis.warnings.map(String) : []
  };
}

function normalizeAnalysisPayload(analysis, input, mode) {
  if (!analysis || typeof analysis !== "object") {
    return buildLocalAnalysis(input);
  }

  const normalized = mode === "openai" ? normalizeOpenAIAnalysis(analysis) : analysis;
  normalized.mode = normalized.mode || mode;
  return normalized;
}

async function analyzeWithLocalEngine(input) {
  try {
    const analysis = await callLocalEngine(input);
    return {
      apiMode: "local-c",
      analysis: normalizeAnalysisPayload(analysis, input, "local-c"),
      warning: ""
    };
  } catch (error) {
    return {
      apiMode: "local-fallback",
      analysis: buildLocalAnalysis(input),
      warning: error.message || "C 로컬 엔진을 실행할 수 없습니다."
    };
  }
}

async function handleAnalyze(req, res) {
  try {
    const body = normalizePayload(await readBody(req));
    if (!body.briefText && !body.projectTitle) {
      return sendJson(res, 400, {
        error: "과제 텍스트 또는 프로젝트명을 입력해야 합니다."
      });
    }

    if (!OPENAI_ENABLED) {
      const localResult = await analyzeWithLocalEngine(body);
      return sendJson(res, 200, {
        apiMode: localResult.apiMode,
        warning: OPENAI_CONFIG_WARNING && OPENAI_API_KEY ? OPENAI_CONFIG_WARNING : localResult.warning,
        analysis: localResult.analysis
      });
    }

    try {
      const analysis = await callOpenAI(body);
      return sendJson(res, 200, {
        apiMode: "openai",
        analysis: normalizeAnalysisPayload(analysis, body, "openai")
      });
    } catch (error) {
      console.warn(`OpenAI analysis failed, using C local engine: ${error.message}`);
      const localResult = await analyzeWithLocalEngine(body);
      return sendJson(res, 200, {
        apiMode: localResult.apiMode,
        warning: localResult.warning,
        analysis: localResult.analysis
      });
    }
  } catch (error) {
    return sendJson(res, 400, {
      error: error.message || "Invalid request body"
    });
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
    if (serveStatic(req, res, "/index.html")) {
      return;
    }
  }

  if (req.method === "GET" && ["/styles.css", "/app.js", "/package.json"].includes(url.pathname)) {
    if (serveStatic(req, res, url.pathname)) {
      return;
    }
  }

  if (req.method === "POST" && url.pathname === "/api/analyze") {
    return handleAnalyze(req, res);
  }

  if (req.method === "GET" && url.pathname === "/api/health") {
    return sendJson(res, 200, {
      ok: true,
      openaiConfigured: OPENAI_ENABLED,
      model: FIXED_OPENAI_MODEL,
      warning: OPENAI_CONFIG_WARNING
    });
  }

  sendText(res, 404, "Not Found");
});

server.listen(PORT, () => {
  console.log(`Assignment planner running on http://localhost:${PORT}`);
  if (OPENAI_ENABLED) {
    console.log(`OpenAI mode: enabled (${FIXED_OPENAI_MODEL})`);
  } else if (OPENAI_API_KEY) {
    console.log(`OpenAI mode: disabled (${FIXED_OPENAI_MODEL})`);
    console.log(OPENAI_CONFIG_WARNING);
  } else {
    console.log("OpenAI mode: local fallback");
  }
});

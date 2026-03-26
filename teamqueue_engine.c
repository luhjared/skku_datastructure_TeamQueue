#define _POSIX_C_SOURCE 200809L

#include <ctype.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/types.h>

#define MAX_MEMBERS 32
#define MAX_QUESTIONS 16
#define MAX_TASKS 16
#define MAX_DELIVERABLES 16
#define MAX_CONSTRAINTS 16
#define MAX_REQUIREMENTS 4
#define MAX_NEXT_ACTIONS 4
#define MAX_WARNINGS 8

typedef struct {
  char *question;
  char *reason;
  char *expectedAnswer;
} Question;

typedef struct {
  char *name;
  char *roles;
  char *rolesLower;
  char *status;
  int capacity;
  char *note;
} Member;

typedef struct {
  char *title;
  char *category;
  char *priority;
  double hours;
  char *notes;
} TaskTemplate;

typedef struct {
  char *id;
  char *title;
  char *category;
  char *priority;
  double estimatedHours;
  char *notes;
  char *suggestedRole;
  char *dependencies[2];
  int dependencyCount;
} Task;

typedef struct {
  char *taskId;
  char *memberName;
  char *rationale;
  double confidence;
} Assignment;

typedef struct {
  char *courseName;
  char *projectTitle;
  char *deadline;
  char *strategy;
  char *briefText;
  char *clarificationText;
  Member members[MAX_MEMBERS];
  int memberCount;
} InputData;

typedef struct {
  char *mode;
  char *projectTitle;
  char *courseName;
  char *deadline;
  char *objective;
  char *summary;
  char *requirements[MAX_REQUIREMENTS];
  int requirementCount;
  char *deliverables[MAX_DELIVERABLES];
  int deliverableCount;
  char *constraints[MAX_CONSTRAINTS];
  int constraintCount;
  Question questions[MAX_QUESTIONS];
  int questionCount;
  Task tasks[MAX_TASKS];
  int taskCount;
  Assignment assignments[MAX_TASKS];
  int assignmentCount;
  char *nextActions[MAX_NEXT_ACTIONS];
  int nextActionCount;
  char *warnings[MAX_WARNINGS];
  int warningCount;
} Analysis;

typedef struct {
  TaskTemplate items[MAX_TASKS];
  int head;
  int tail;
  int size;
} TemplateQueue;

static char *xstrdup(const char *value) {
  const char *source = value ? value : "";
  size_t length = strlen(source);
  char *copy = (char *)malloc(length + 1);
  if (!copy) {
    fprintf(stderr, "memory allocation failed\n");
    exit(1);
  }
  memcpy(copy, source, length + 1);
  return copy;
}

static int starts_with(const char *value, const char *prefix) {
  return strncmp(value, prefix, strlen(prefix)) == 0;
}

static void trim_newline(char *value) {
  size_t length = strlen(value);
  while (length > 0 && (value[length - 1] == '\n' || value[length - 1] == '\r')) {
    value[--length] = '\0';
  }
}

static char *ascii_lower_copy(const char *value) {
  const char *source = value ? value : "";
  size_t length = strlen(source);
  char *copy = (char *)malloc(length + 1);
  if (!copy) {
    fprintf(stderr, "memory allocation failed\n");
    exit(1);
  }
  for (size_t i = 0; i < length; ++i) {
    unsigned char ch = (unsigned char)source[i];
    copy[i] = (char)((ch >= 'A' && ch <= 'Z') ? (ch + 32) : ch);
  }
  copy[length] = '\0';
  return copy;
}

static int base64_value(unsigned char ch) {
  if (ch >= 'A' && ch <= 'Z') return ch - 'A';
  if (ch >= 'a' && ch <= 'z') return ch - 'a' + 26;
  if (ch >= '0' && ch <= '9') return ch - '0' + 52;
  if (ch == '+') return 62;
  if (ch == '/') return 63;
  return -1;
}

static char *decode_base64(const char *input) {
  size_t length = strlen(input);
  if (length == 0) {
    return xstrdup("");
  }

  char *output = (char *)malloc((length / 4) * 3 + 4);
  if (!output) {
    fprintf(stderr, "memory allocation failed\n");
    exit(1);
  }

  size_t outIndex = 0;
  for (size_t i = 0; i < length; i += 4) {
    int a = base64_value((unsigned char)input[i]);
    int b = base64_value((unsigned char)input[i + 1]);
    int c = input[i + 2] == '=' ? -2 : base64_value((unsigned char)input[i + 2]);
    int d = input[i + 3] == '=' ? -2 : base64_value((unsigned char)input[i + 3]);

    if (a < 0 || b < 0) {
      break;
    }

    output[outIndex++] = (char)((a << 2) | (b >> 4));
    if (c >= 0) {
      output[outIndex++] = (char)(((b & 0x0f) << 4) | (c >> 2));
    }
    if (d >= 0) {
      output[outIndex++] = (char)(((c & 0x03) << 6) | d);
    }
  }

  output[outIndex] = '\0';
  return output;
}

static int contains_text(const char *haystack, const char *needle) {
  return haystack && needle && strstr(haystack, needle) != NULL;
}

static int contains_any(const char *haystack, const char *const *needles, size_t needleCount) {
  for (size_t i = 0; i < needleCount; ++i) {
    if (contains_text(haystack, needles[i])) {
      return 1;
    }
  }
  return 0;
}

static int has_numbered_unit(const char *text, const char *unit) {
  if (!text || !unit) {
    return 0;
  }

  size_t unitLength = strlen(unit);
  size_t textLength = strlen(text);

  for (size_t i = 0; i < textLength; ++i) {
    if (!isdigit((unsigned char)text[i])) {
      continue;
    }

    size_t j = i;
    while (j < textLength && isdigit((unsigned char)text[j])) {
      ++j;
    }
    while (j < textLength && (text[j] == ' ' || text[j] == '\t')) {
      ++j;
    }

    if (j + unitLength <= textLength && strncmp(text + j, unit, unitLength) == 0) {
      return 1;
    }
  }

  return 0;
}

static char *join_parts(const char *const *parts, size_t count) {
  size_t totalLength = 0;
  for (size_t i = 0; i < count; ++i) {
    if (parts[i] && parts[i][0]) {
      totalLength += strlen(parts[i]) + 1;
    }
  }

  if (totalLength == 0) {
    return xstrdup("");
  }

  char *joined = (char *)malloc(totalLength + 1);
  if (!joined) {
    fprintf(stderr, "memory allocation failed\n");
    exit(1);
  }

  joined[0] = '\0';
  for (size_t i = 0; i < count; ++i) {
    if (!parts[i] || !parts[i][0]) {
      continue;
    }
    if (joined[0]) {
      strcat(joined, "\n");
    }
    strcat(joined, parts[i]);
  }

  return joined;
}

static char *detect_iso_date(const char *text) {
  if (!text) {
    return NULL;
  }

  size_t length = strlen(text);
  for (size_t i = 0; i + 9 < length; ++i) {
    if (!isdigit((unsigned char)text[i]) || !isdigit((unsigned char)text[i + 1]) ||
        !isdigit((unsigned char)text[i + 2]) || !isdigit((unsigned char)text[i + 3])) {
      continue;
    }

    char separator = text[i + 4];
    if (separator != '-' && separator != '.' && separator != '/') {
      continue;
    }

    if (!isdigit((unsigned char)text[i + 5]) || !isdigit((unsigned char)text[i + 6]) ||
        text[i + 7] != separator || !isdigit((unsigned char)text[i + 8]) ||
        !isdigit((unsigned char)text[i + 9])) {
      continue;
    }

    char *copy = (char *)malloc(11);
    if (!copy) {
      fprintf(stderr, "memory allocation failed\n");
      exit(1);
    }
    memcpy(copy, text + i, 10);
    copy[4] = '-';
    copy[7] = '-';
    copy[10] = '\0';
    return copy;
  }

  return NULL;
}

static void queue_init(TemplateQueue *queue) {
  queue->head = 0;
  queue->tail = 0;
  queue->size = 0;
}

static int queue_push(TemplateQueue *queue, TaskTemplate item) {
  if (queue->size >= MAX_TASKS) {
    return 0;
  }

  queue->items[queue->tail] = item;
  queue->tail = (queue->tail + 1) % MAX_TASKS;
  queue->size++;
  return 1;
}

static int queue_pop(TemplateQueue *queue, TaskTemplate *item) {
  if (queue->size <= 0) {
    return 0;
  }

  *item = queue->items[queue->head];
  queue->head = (queue->head + 1) % MAX_TASKS;
  queue->size--;
  return 1;
}

static char *make_task_id(int index) {
  char buffer[16];
  snprintf(buffer, sizeof(buffer), "task_%02d", index + 1);
  return xstrdup(buffer);
}

static void push_question(Analysis *analysis, const char *question, const char *reason, const char *expectedAnswer) {
  if (analysis->questionCount >= MAX_QUESTIONS) {
    return;
  }
  analysis->questions[analysis->questionCount++] = (Question){
    .question = (char *)question,
    .reason = (char *)reason,
    .expectedAnswer = (char *)expectedAnswer
  };
}

static void push_constraint(Analysis *analysis, const char *constraint) {
  if (analysis->constraintCount >= MAX_CONSTRAINTS) {
    return;
  }
  analysis->constraints[analysis->constraintCount++] = (char *)constraint;
}

static void push_deliverable(Analysis *analysis, const char *deliverable) {
  if (analysis->deliverableCount >= MAX_DELIVERABLES) {
    return;
  }
  analysis->deliverables[analysis->deliverableCount++] = (char *)deliverable;
}

static void push_next_action(Analysis *analysis, const char *action) {
  if (analysis->nextActionCount >= MAX_NEXT_ACTIONS) {
    return;
  }
  analysis->nextActions[analysis->nextActionCount++] = (char *)action;
}

static void push_warning(Analysis *analysis, const char *warning) {
  if (analysis->warningCount >= MAX_WARNINGS) {
    return;
  }
  analysis->warnings[analysis->warningCount++] = (char *)warning;
}

static int member_has_role(const Member *member, const char *needle) {
  return member && member->rolesLower && needle && strstr(member->rolesLower, needle) != NULL;
}

static void assign_tasks_locally(
  const Task *tasks,
  int taskCount,
  const InputData *input,
  const char *strategy,
  Assignment *assignments,
  int *assignmentCount
) {
  if (taskCount <= 0) {
    *assignmentCount = 0;
    return;
  }

  if (input->memberCount <= 0) {
    for (int i = 0; i < taskCount; ++i) {
      assignments[i] = (Assignment){
        .taskId = tasks[i].id,
        .memberName = NULL,
        .rationale = xstrdup("팀원 정보가 없어서 배정 추천을 만들 수 없습니다."),
        .confidence = 0.08
      };
    }
    *assignmentCount = taskCount;
    return;
  }

  int loadMap[MAX_MEMBERS] = {0};
  for (int i = 0; i < taskCount; ++i) {
    int bestIndex = -1;
    int bestScore = -100000;

    char taskBuffer[256];
    snprintf(taskBuffer, sizeof(taskBuffer), "%s %s %s", tasks[i].title, tasks[i].category, tasks[i].suggestedRole);
    char *taskTextLower = ascii_lower_copy(taskBuffer);

    for (int m = 0; m < input->memberCount; ++m) {
      const Member *member = &input->members[m];
      if (strcmp(member->status, "away") == 0) {
        continue;
      }

      int score = 0;
      if (strcmp(member->status, "available") == 0) {
        score += 30;
      } else if (strcmp(member->status, "busy") == 0) {
        score += 10;
      }

      if (strcmp(strategy, "speed") == 0 && strcmp(member->status, "available") == 0) {
        score += 8;
      }

      if (strcmp(strategy, "presentation") == 0 &&
          (member_has_role(member, "발표") || member_has_role(member, "ppt"))) {
        score += 14;
      }

      if (member->rolesLower && member->rolesLower[0] && contains_text(taskTextLower, member->rolesLower)) {
        score += 28;
      }

      if (strcmp(tasks[i].category, "발표") == 0 && member_has_role(member, "발표")) {
        score += 18;
      }
      if (strcmp(tasks[i].category, "PPT") == 0 && (member_has_role(member, "ppt") || member_has_role(member, "디자인"))) {
        score += 18;
      }
      if (strcmp(tasks[i].category, "개발") == 0 && (member_has_role(member, "코드") || member_has_role(member, "개발"))) {
        score += 18;
      }
      if (strcmp(tasks[i].category, "조사") == 0 && (member_has_role(member, "조사") || member_has_role(member, "리서치") || member_has_role(member, "research"))) {
        score += 16;
      }
      if (strcmp(tasks[i].category, "문서") == 0 && (member_has_role(member, "문서") || member_has_role(member, "정리"))) {
        score += 16;
      }
      if (strcmp(tasks[i].category, "검토") == 0 && (member_has_role(member, "검토") || member_has_role(member, "교정"))) {
        score += 16;
      }

      int currentLoad = loadMap[m];
      score += (member->capacity - currentLoad > 0 ? member->capacity - currentLoad : 0) * 4;
      score -= currentLoad * 3;

      if (score > bestScore) {
        bestScore = score;
        bestIndex = m;
      }
    }

    if (bestIndex < 0) {
      bestIndex = 0;
    }

    loadMap[bestIndex]++;

    double confidence = bestScore <= 0 ? 0.18 : (double)bestScore / 60.0;
    if (confidence < 0.15) confidence = 0.15;
    if (confidence > 0.98) confidence = 0.98;

    char rationaleBuffer[256];
    snprintf(
      rationaleBuffer,
      sizeof(rationaleBuffer),
      "%s 님의 역할 태그와 현재 가용성을 기준으로 가장 무난한 배정입니다.",
      input->members[bestIndex].name
    );

    assignments[i] = (Assignment){
      .taskId = (char *)tasks[i].id,
      .memberName = input->members[bestIndex].name,
      .rationale = xstrdup(rationaleBuffer),
      .confidence = confidence
    };

    free(taskTextLower);
  }

  *assignmentCount = taskCount;
}

static void sort_templates(TaskTemplate *templates, int count, const char *strategy) {
  if (count <= 1 || strcmp(strategy, "balanced") == 0) {
    return;
  }

  for (int i = 0; i < count - 1; ++i) {
    for (int j = i + 1; j < count; ++j) {
      int scoreI = 0;
      int scoreJ = 0;

      if (strcmp(strategy, "speed") == 0) {
        scoreI += strcmp(templates[i].priority, "urgent") == 0 ? 0 : strcmp(templates[i].priority, "normal") == 0 ? 1 : 2;
        scoreJ += strcmp(templates[j].priority, "urgent") == 0 ? 0 : strcmp(templates[j].priority, "normal") == 0 ? 1 : 2;
      } else if (strcmp(strategy, "presentation") == 0) {
        scoreI += (strcmp(templates[i].category, "발표") == 0 || strcmp(templates[i].category, "PPT") == 0) ? 0 : 10;
        scoreJ += (strcmp(templates[j].category, "발표") == 0 || strcmp(templates[j].category, "PPT") == 0) ? 0 : 10;
        scoreI += strcmp(templates[i].priority, "urgent") == 0 ? 0 : 1;
        scoreJ += strcmp(templates[j].priority, "urgent") == 0 ? 0 : 1;
      }

      if (scoreJ < scoreI) {
        TaskTemplate temp = templates[i];
        templates[i] = templates[j];
        templates[j] = temp;
      }
    }
  }
}

static void parse_member_line(InputData *input, const char *encodedLine) {
  if (input->memberCount >= MAX_MEMBERS) {
    return;
  }

  char *copy = xstrdup(encodedLine);
  char *parts[5] = {NULL, NULL, NULL, NULL, NULL};
  int partIndex = 0;
  char *cursor = copy;
  char *start = copy;

  while (*cursor && partIndex < 4) {
    if (*cursor == '|') {
      *cursor = '\0';
      parts[partIndex++] = start;
      start = cursor + 1;
    }
    ++cursor;
  }
  parts[partIndex++] = start;

  if (partIndex != 5) {
    free(copy);
    return;
  }

  Member member;
  member.name = decode_base64(parts[0]);
  member.roles = decode_base64(parts[1]);
  member.rolesLower = ascii_lower_copy(member.roles);
  member.status = decode_base64(parts[2]);
  member.capacity = atoi(parts[3]);
  if (member.capacity <= 0) {
    member.capacity = 2;
  }
  member.note = decode_base64(parts[4]);

  input->members[input->memberCount++] = member;
  free(copy);
}

static void read_input(InputData *input) {
  char *line = NULL;
  size_t capacity = 0;
  ssize_t read = 0;

  while ((read = getline(&line, &capacity, stdin)) != -1) {
    (void)read;
    trim_newline(line);
    if (line[0] == '\0') {
      continue;
    }

    if (starts_with(line, "courseName=")) {
      input->courseName = decode_base64(line + strlen("courseName="));
      continue;
    }
    if (starts_with(line, "projectTitle=")) {
      input->projectTitle = decode_base64(line + strlen("projectTitle="));
      continue;
    }
    if (starts_with(line, "deadline=")) {
      input->deadline = decode_base64(line + strlen("deadline="));
      continue;
    }
    if (starts_with(line, "strategy=")) {
      input->strategy = decode_base64(line + strlen("strategy="));
      continue;
    }
    if (starts_with(line, "briefText=")) {
      input->briefText = decode_base64(line + strlen("briefText="));
      continue;
    }
    if (starts_with(line, "clarificationText=")) {
      input->clarificationText = decode_base64(line + strlen("clarificationText="));
      continue;
    }
    if (starts_with(line, "member=")) {
      parse_member_line(input, line + strlen("member="));
      continue;
    }
  }

  free(line);
}

static void print_json_string(FILE *out, const char *value) {
  if (!value) {
    fputs("null", out);
    return;
  }

  fputc('"', out);
  for (const unsigned char *p = (const unsigned char *)value; *p; ++p) {
    switch (*p) {
      case '\\': fputs("\\\\", out); break;
      case '"': fputs("\\\"", out); break;
      case '\b': fputs("\\b", out); break;
      case '\f': fputs("\\f", out); break;
      case '\n': fputs("\\n", out); break;
      case '\r': fputs("\\r", out); break;
      case '\t': fputs("\\t", out); break;
      default:
        if (*p < 0x20) {
          fprintf(out, "\\u%04x", *p);
        } else {
          fputc(*p, out);
        }
    }
  }
  fputc('"', out);
}

static void print_string_array(FILE *out, const char *const *items, int count) {
  fputc('[', out);
  for (int i = 0; i < count; ++i) {
    if (i > 0) {
      fputc(',', out);
    }
    print_json_string(out, items[i]);
  }
  fputc(']', out);
}

static void print_question_array(FILE *out, const Question *questions, int count) {
  fputc('[', out);
  for (int i = 0; i < count; ++i) {
    if (i > 0) {
      fputc(',', out);
    }
    fputc('{', out);
    fputs("\"question\":", out);
    print_json_string(out, questions[i].question);
    fputs(",\"reason\":", out);
    print_json_string(out, questions[i].reason);
    fputs(",\"expectedAnswer\":", out);
    print_json_string(out, questions[i].expectedAnswer);
    fputc('}', out);
  }
  fputc(']', out);
}

static void print_task_array(FILE *out, const Task *tasks, int count) {
  fputc('[', out);
  for (int i = 0; i < count; ++i) {
    if (i > 0) {
      fputc(',', out);
    }
    fputc('{', out);
    fputs("\"id\":", out);
    print_json_string(out, tasks[i].id);
    fputs(",\"title\":", out);
    print_json_string(out, tasks[i].title);
    fputs(",\"category\":", out);
    print_json_string(out, tasks[i].category);
    fputs(",\"priority\":", out);
    print_json_string(out, tasks[i].priority);
    fputs(",\"estimatedHours\":", out);
    fprintf(out, "%.2f", tasks[i].estimatedHours);
    fputs(",\"notes\":", out);
    print_json_string(out, tasks[i].notes);
    fputs(",\"suggestedRole\":", out);
    print_json_string(out, tasks[i].suggestedRole);
    fputs(",\"dependencies\":[", out);
    for (int j = 0; j < tasks[i].dependencyCount; ++j) {
      if (j > 0) {
        fputc(',', out);
      }
      print_json_string(out, tasks[i].dependencies[j]);
    }
    fputs("]}", out);
  }
  fputc(']', out);
}

static void print_assignment_array(FILE *out, const Assignment *assignments, int count) {
  fputc('[', out);
  for (int i = 0; i < count; ++i) {
    if (i > 0) {
      fputc(',', out);
    }
    fputc('{', out);
    fputs("\"taskId\":", out);
    print_json_string(out, assignments[i].taskId);
    fputs(",\"memberName\":", out);
    print_json_string(out, assignments[i].memberName);
    fputs(",\"rationale\":", out);
    print_json_string(out, assignments[i].rationale);
    fputs(",\"confidence\":", out);
    fprintf(out, "%.2f", assignments[i].confidence);
    fputc('}', out);
  }
  fputc(']', out);
}

static Analysis build_analysis(const InputData *input) {
  Analysis analysis;
  memset(&analysis, 0, sizeof(analysis));

  analysis.mode = "local-c";
  analysis.courseName = input->courseName && input->courseName[0] ? input->courseName : "과목명 미입력";
  analysis.projectTitle = input->projectTitle && input->projectTitle[0] ? input->projectTitle : "학생 과제";
  analysis.objective =
    strcmp(input->strategy, "presentation") == 0
      ? "발표 중심의 역할 분담"
      : strcmp(input->strategy, "speed") == 0
        ? "빠른 마감 대응"
        : "균형 잡힌 역할 분배";

  const char *parts[] = {
    input->courseName,
    input->projectTitle,
    input->deadline,
    input->briefText,
    input->clarificationText
  };
  char *combined = join_parts(parts, 5);
  char *lower = ascii_lower_copy(combined);
  char *detectedDate = detect_iso_date(combined);
  analysis.deadline = input->deadline && input->deadline[0] ? input->deadline : detectedDate;

  const char *presentationTerms[] = {"발표", "ppt", "프레젠테이션", "presentation", "발표자료"};
  const char *reportTerms[] = {"보고서", "레포트", "report", "문서"};
  const char *codeTerms[] = {"코드", "구현", "프로그램", "python", "java", "c언어", "c 언어", "javascript", "typescript", "react", "html", "css"};
  const char *researchTerms[] = {"조사", "분석", "자료조사", "리서치", "reference", "출처"};
  const char *designTerms[] = {"디자인", "시각", "레이아웃", "ui", "ux", "표지"};
  const char *testTerms[] = {"테스트", "검증", "리뷰", "교정", "확인"};

  int hasPresentation = contains_any(lower, presentationTerms, sizeof(presentationTerms) / sizeof(presentationTerms[0]));
  int hasReport = contains_any(lower, reportTerms, sizeof(reportTerms) / sizeof(reportTerms[0]));
  int hasCode = contains_any(lower, codeTerms, sizeof(codeTerms) / sizeof(codeTerms[0]));
  int hasResearch = contains_any(lower, researchTerms, sizeof(researchTerms) / sizeof(researchTerms[0]));
  int hasDesign = contains_any(lower, designTerms, sizeof(designTerms) / sizeof(designTerms[0]));
  int hasTest = contains_any(lower, testTerms, sizeof(testTerms) / sizeof(testTerms[0]));

  analysis.requirements[analysis.requirementCount++] = "과제 설명을 실행 가능한 작업으로 분해";
  analysis.requirements[analysis.requirementCount++] = "팀원 역할과 가용 시간 반영";
  analysis.requirements[analysis.requirementCount++] = "배정 이유를 사람이 이해할 수 있게 설명";

  if (hasPresentation) {
    push_deliverable(&analysis, "발표자료");
    push_deliverable(&analysis, "발표 스크립트");
  }
  if (hasReport) {
    push_deliverable(&analysis, "보고서 본문");
  }
  if (hasCode) {
    push_deliverable(&analysis, "기능 구현 코드");
    push_deliverable(&analysis, "실행 확인 또는 테스트");
  }
  if (hasResearch) {
    push_deliverable(&analysis, "조사 요약 및 출처 정리");
  }
  if (hasDesign) {
    push_deliverable(&analysis, "표지 또는 시각 디자인");
  }
  if (hasTest) {
    push_deliverable(&analysis, "최종 검토");
  }
  if (analysis.deliverableCount == 0) {
    push_deliverable(&analysis, "과제 요구사항 해석");
    push_deliverable(&analysis, "실행 계획서");
  }

  if (analysis.deadline) {
    push_constraint(&analysis, analysis.deadline);
  }
  if (has_numbered_unit(lower, "분") || contains_text(lower, "minute") || contains_text(lower, "min") || contains_text(lower, "초")) {
    push_constraint(&analysis, "발표 시간 제한");
  }
  if (contains_any(lower, (const char *const[]){"페이지", "쪽", "page", "p."}, 4)) {
    push_constraint(&analysis, "분량 제한");
  }
  if (hasCode && contains_any(lower, (const char *const[]){"python", "java", "c언어", "c 언어", "javascript", "typescript", "react", "html", "css"}, 9)) {
    if (contains_text(lower, "python")) {
      push_constraint(&analysis, "사용 기술 python");
    } else if (contains_text(lower, "java")) {
      push_constraint(&analysis, "사용 기술 java");
    } else if (contains_text(lower, "javascript")) {
      push_constraint(&analysis, "사용 기술 javascript");
    } else if (contains_text(lower, "typescript")) {
      push_constraint(&analysis, "사용 기술 typescript");
    } else if (contains_text(lower, "react")) {
      push_constraint(&analysis, "사용 기술 react");
    } else if (contains_text(lower, "html")) {
      push_constraint(&analysis, "사용 기술 html");
    } else if (contains_text(lower, "css")) {
      push_constraint(&analysis, "사용 기술 css");
    } else {
      push_constraint(&analysis, "사용 기술 c언어");
    }
  }
  if (analysis.constraintCount == 0) {
    push_constraint(&analysis, "추가 조건 확인 필요");
  }

  if (!input->deadline && !detectedDate) {
    push_question(
      &analysis,
      "마감일이 언제인가요?",
      "배정 우선순위와 일감 순서를 정하려면 마감일이 필요합니다.",
      "YYYY-MM-DD 형식 또는 제출 시각"
    );
  }
  if (hasPresentation && !has_numbered_unit(lower, "분")) {
    push_question(
      &analysis,
      "발표 시간은 몇 분인가요?",
      "발표 슬라이드와 대본 분량을 조정하기 위해 필요합니다.",
      "예: 5분, 7분"
    );
  }
  if (hasCode && !contains_any(lower, (const char *const[]){"python", "java", "c언어", "c 언어", "javascript", "typescript", "react", "html", "css"}, 9)) {
    push_question(
      &analysis,
      "사용할 개발 언어 또는 프레임워크가 정해져 있나요?",
      "구현 담당을 정할 때 팀원 역량과 도구를 맞춰야 합니다.",
      "예: Python, Java, React"
    );
  }
  if (hasReport && !contains_any(lower, (const char *const[]){"pdf", "hwp", "docx", "pptx"}, 4)) {
    push_question(
      &analysis,
      "최종 제출 형식은 무엇인가요?",
      "문서 담당과 검토 절차를 정하기 위해 필요합니다.",
      "예: PDF, HWP, DOCX"
    );
  }

  TaskTemplate templates[MAX_TASKS];
  int templateCount = 0;

  templates[templateCount++] = (TaskTemplate){
    .title = "요구사항 정리와 범위 확정",
    .category = "기획",
    .priority = "urgent",
    .hours = 1.5,
    .notes = "발표 여부, 제출물, 분량, 금지사항을 먼저 정리"
  };

  if (hasPresentation) {
    templates[templateCount++] = (TaskTemplate){
      .title = "발표 흐름과 도입 문장 작성",
      .category = "발표",
      .priority = strcmp(input->strategy, "presentation") == 0 ? "urgent" : "normal",
      .hours = 2.0,
      .notes = "도입-문제-해결-기대효과 순서로 스토리 구성"
    };
    templates[templateCount++] = (TaskTemplate){
      .title = "슬라이드 초안 구성",
      .category = "PPT",
      .priority = "normal",
      .hours = 3.0,
      .notes = "슬라이드 수와 각 장의 핵심 메시지 배치"
    };
  }

  if (hasResearch) {
    templates[templateCount++] = (TaskTemplate){
      .title = "자료 조사와 출처 수집",
      .category = "조사",
      .priority = "normal",
      .hours = 3.0,
      .notes = "핵심 근거와 참고문헌을 먼저 모으기"
    };
  }

  if (hasCode) {
    templates[templateCount++] = (TaskTemplate){
      .title = "핵심 기능 구현",
      .category = "개발",
      .priority = "urgent",
      .hours = 4.0,
      .notes = "실행 가능한 최소 기능부터 구현"
    };
    templates[templateCount++] = (TaskTemplate){
      .title = "테스트와 예외 처리",
      .category = "검증",
      .priority = "normal",
      .hours = 2.0,
      .notes = "입력 예외와 실패 케이스 점검"
    };
  }

  if (hasReport) {
    templates[templateCount++] = (TaskTemplate){
      .title = "보고서 본문 작성",
      .category = "문서",
      .priority = "normal",
      .hours = 3.0,
      .notes = "요약, 배경, 방법, 결과, 결론 순서로 구성"
    };
    templates[templateCount++] = (TaskTemplate){
      .title = "맞춤법과 형식 교정",
      .category = "검토",
      .priority = "low",
      .hours = 1.0,
      .notes = "표지, 목차, 페이지 번호까지 검토"
    };
  }

  if (hasDesign) {
    templates[templateCount++] = (TaskTemplate){
      .title = "시각 디자인과 표지 정리",
      .category = "디자인",
      .priority = "normal",
      .hours = 2.0,
      .notes = "표지, 강조 색, 레이아웃 통일"
    };
  }

  if (!hasPresentation && !hasReport && !hasCode && !hasResearch && !hasDesign) {
    templates[templateCount++] = (TaskTemplate){
      .title = "세부 과제 쪼개기",
      .category = "기획",
      .priority = "normal",
      .hours = 2.0,
      .notes = "과제를 발표, 문서, 조사, 검증 단위로 나누기"
    };
    templates[templateCount++] = (TaskTemplate){
      .title = "팀원 역할 분담",
      .category = "배정",
      .priority = "normal",
      .hours = 1.0,
      .notes = "역할과 마감에 따라 담당자 추천"
    };
  }

  templates[templateCount++] = (TaskTemplate){
    .title = "최종 검토와 제출 체크",
    .category = "검토",
    .priority = "urgent",
    .hours = 1.0,
    .notes = "마감 직전 빠진 항목을 확인"
  };

  if (templateCount > MAX_TASKS) {
    templateCount = MAX_TASKS;
  }

  sort_templates(templates, templateCount, input->strategy);

  TemplateQueue queue;
  queue_init(&queue);
  for (int i = 0; i < templateCount; ++i) {
    queue_push(&queue, templates[i]);
  }

  analysis.taskCount = 0;
  int taskLimit = strcmp(input->strategy, "speed") == 0 ? 5 : 7;
  if (taskLimit > MAX_TASKS) {
    taskLimit = MAX_TASKS;
  }

  TaskTemplate template;
  while (analysis.taskCount < taskLimit && queue_pop(&queue, &template)) {
    int index = analysis.taskCount;
    Task task;
    memset(&task, 0, sizeof(task));
    task.id = make_task_id(index);
    task.title = (char *)template.title;
    task.category = (char *)template.category;
    task.priority = (char *)template.priority;
    task.estimatedHours = template.hours;
    task.notes = (char *)template.notes;
    task.suggestedRole = (char *)template.category;
    task.dependencies[0] = NULL;
    task.dependencies[1] = NULL;
    task.dependencyCount = 0;
    if (index > 0) {
      task.dependencies[0] = analysis.tasks[index - 1].id;
      task.dependencyCount = 1;
    }
    analysis.tasks[analysis.taskCount++] = task;
  }

  assign_tasks_locally(
    analysis.tasks,
    analysis.taskCount,
    input,
    input->strategy,
    analysis.assignments,
    &analysis.assignmentCount
  );

  char summaryBuffer[1024];
  snprintf(
    summaryBuffer,
    sizeof(summaryBuffer),
    "%s의 %s를(을) 기준으로 %d개 작업을 분해하고 %d명에게 배정 초안을 만들었습니다. %s",
    analysis.courseName,
    analysis.projectTitle,
    analysis.taskCount,
    input->memberCount,
    analysis.questionCount ? "추가 확인 질문이 있습니다." : "추가 확인 질문은 없습니다."
  );
  analysis.summary = xstrdup(summaryBuffer);

  if (analysis.questionCount) {
    push_next_action(&analysis, "질문에 답을 채우고 재분석하세요.");
  }
  if (input->memberCount == 0) {
    push_next_action(&analysis, "팀원 프로필을 추가하세요.");
  } else if (analysis.taskCount > 0) {
    push_next_action(&analysis, "추천 배정을 확인하고 확정하세요.");
  }
  if (analysis.nextActionCount == 0) {
    push_next_action(&analysis, "배정 결과를 확정하고 공유하세요.");
  }

  if (input->memberCount == 0) {
    push_warning(&analysis, "팀원 정보가 없어서 자동 배정은 제한됩니다.");
  }

  free(combined);
  free(lower);
  return analysis;
}

static void print_analysis_json(const Analysis *analysis) {
  fputs("{", stdout);
  fputs("\"mode\":", stdout);
  print_json_string(stdout, analysis->mode);
  fputs(",\"project\":{", stdout);
  fputs("\"title\":", stdout);
  print_json_string(stdout, analysis->projectTitle);
  fputs(",\"course\":", stdout);
  print_json_string(stdout, analysis->courseName);
  fputs(",\"deadline\":", stdout);
  print_json_string(stdout, analysis->deadline);
  fputs(",\"objective\":", stdout);
  print_json_string(stdout, analysis->objective);
  fputs("}", stdout);
  fputs(",\"summary\":", stdout);
  print_json_string(stdout, analysis->summary);
  fputs(",\"requirements\":", stdout);
  print_string_array(stdout, (const char *const *)analysis->requirements, analysis->requirementCount);
  fputs(",\"deliverables\":", stdout);
  print_string_array(stdout, (const char *const *)analysis->deliverables, analysis->deliverableCount);
  fputs(",\"constraints\":", stdout);
  print_string_array(stdout, (const char *const *)analysis->constraints, analysis->constraintCount);
  fputs(",\"questions\":", stdout);
  print_question_array(stdout, analysis->questions, analysis->questionCount);
  fputs(",\"tasks\":", stdout);
  print_task_array(stdout, analysis->tasks, analysis->taskCount);
  fputs(",\"assignments\":", stdout);
  print_assignment_array(stdout, analysis->assignments, analysis->assignmentCount);
  fputs(",\"nextActions\":", stdout);
  print_string_array(stdout, (const char *const *)analysis->nextActions, analysis->nextActionCount);
  fputs(",\"warnings\":", stdout);
  print_string_array(stdout, (const char *const *)analysis->warnings, analysis->warningCount);
  fputs("}", stdout);
  fputc('\n', stdout);
}

int main(void) {
  InputData input;
  memset(&input, 0, sizeof(input));

  input.strategy = xstrdup("balanced");
  read_input(&input);

  Analysis analysis = build_analysis(&input);
  print_analysis_json(&analysis);
  return 0;
}

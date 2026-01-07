# Portfolio Work Plan Manager: Strategic Value Proposition
## Why This Tool Complements (Not Competes With) Jira

---

## Executive Summary

The Portfolio Work Plan Manager addresses a **critical gap** in our planning capabilities that Jira Kanban is not designed to fill. While Jira excels at **production execution** (day-to-day task tracking), the Portfolio Manager provides **strategic quarterly planning** with capacity management, effort tracking, and portfolio health visibility.

| Current State | With Portfolio Manager |
|---------------|------------------------|
| Task planning via slides | Structured initiative tracking |
| No capacity visibility | Real-time capacity load per team |
| Manual effort tracking | Automated effort variance alerts |
| Siloed asset class views | Unified portfolio dashboard |
| Reactive planning | Proactive health scoring |

**Recommendation:** Keep the Portfolio Work Plan Manager for quarterly planning and capacity management. Continue using Jira for production execution. The tools serve different purposes in our workflow.

---

## 1. The Problem We're Solving

### Current Pain Points (Slides-Based Planning)

| Challenge | Impact |
|-----------|--------|
| **No capacity visibility** | Teams overcommitted without early warning |
| **Manual effort tracking** | Actual vs. planned variance discovered too late |
| **Scattered information** | Asset class data across multiple decks |
| **No historical tracking** | Difficult to learn from past quarters |
| **Static snapshots** | Out of date by the time they're presented |

### Why Jira Doesn't Solve These Problems

Jira Kanban is optimized for **execution**, not **planning**:

- **Flat structure**: Jira lacks our 5-level hierarchy (Asset Class → Pillar → Responsibility → Target → Initiative)
- **No native capacity planning**: Requires expensive add-ons and complex configuration
- **Sprint-oriented**: Designed for 2-week cycles, not quarterly planning
- **Team-level focus**: Not built for portfolio-wide visibility across asset classes
- **Generic workflows**: Our planning rules would require extensive customization

---

## 2. Understanding Jira Kanban: Strengths & Limitations

### What is Kanban?

Kanban is a **visual workflow management method** originating from Toyota's manufacturing system. Its core principles:

| Principle | Description |
|-----------|-------------|
| **Visualize Work** | See all tasks on a board with columns representing stages |
| **Limit Work-in-Progress (WIP)** | Cap how many items can be in each stage simultaneously |
| **Manage Flow** | Optimize the smooth movement of work from start to finish |
| **Continuous Delivery** | No fixed time-boxes; work flows as capacity allows |
| **Pull System** | Team pulls new work only when capacity is available |

### What Jira Kanban Excels At

Jira Kanban is a **powerful execution tool**. We should acknowledge its genuine strengths:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        JIRA KANBAN BOARD                                │
├──────────────┬──────────────┬──────────────┬──────────────┬────────────┤
│   BACKLOG    │   TO DO      │  IN PROGRESS │   REVIEW     │    DONE    │
│              │   (WIP: 5)   │   (WIP: 3)   │   (WIP: 2)   │            │
├──────────────┼──────────────┼──────────────┼──────────────┼────────────┤
│ ┌──────────┐ │ ┌──────────┐ │ ┌──────────┐ │ ┌──────────┐ │ ┌────────┐ │
│ │ POL-234  │ │ │ POL-189  │ │ │ POL-201  │ │ │ POL-178  │ │ │POL-156 │ │
│ │ Fix loan │ │ │ Update   │ │ │ Refactor │ │ │ Code     │ │ │  ✓     │ │
│ │ calc     │ │ │ API docs │ │ │ auth     │ │ │ review   │ │ └────────┘ │
│ └──────────┘ │ └──────────┘ │ └──────────┘ │ └──────────┘ │ ┌────────┐ │
│ ┌──────────┐ │ ┌──────────┐ │ ┌──────────┐ │              │ │POL-167 │ │
│ │ POL-245  │ │ │ POL-192  │ │ │ POL-208  │ │              │ │  ✓     │ │
│ │ Add new  │ │ │ Write    │ │ │ Deploy   │ │              │ └────────┘ │
│ │ report   │ │ │ tests    │ │ │ staging  │ │              │            │
│ └──────────┘ │ └──────────┘ │ └──────────┘ │              │            │
└──────────────┴──────────────┴──────────────┴──────────────┴────────────┘
```

| Jira Kanban Strength | Why It Matters |
|----------------------|----------------|
| **Visual clarity** | Instantly see what's in progress, blocked, or done |
| **WIP limits** | Prevent overload; focus on finishing vs. starting |
| **Drag-and-drop** | Quick status updates with minimal friction |
| **Swimlanes** | Group by assignee, priority, or type |
| **Cumulative flow diagrams** | Spot bottlenecks in the process |
| **Cycle time metrics** | Measure how long tasks take end-to-end |
| **Mature ecosystem** | Integrations, plugins, widespread adoption |
| **Production-ready** | Already supporting our production execution |

### Jira Kanban: Pros & Cons for Quarterly Work Planning

Here's where the methodology meets our specific needs:

#### ✅ What Kanban/Jira Does Well

| Capability | Benefit for Us |
|------------|----------------|
| **Task visualization** | Good for seeing daily/weekly work status |
| **Flow optimization** | Helps production teams manage throughput |
| **Bottleneck detection** | Identifies where work gets stuck |
| **Flexibility** | No fixed sprints; work flows continuously |
| **Industry standard** | Teams already know how to use it |

#### ❌ What Kanban/Jira Lacks for Quarterly Planning

| Gap | Impact on Our Work Plan |
|-----|-------------------------|
| **No capacity planning** | Can't see "Team X has 10 staff-weeks, committed 12" |
| **Task-level focus** | Designed for individual tasks, not initiative portfolios |
| **No effort tracking in staff-weeks** | Uses story points or hours, not our planning unit |
| **Flat hierarchy** | Epic → Story → Subtask (3 levels max vs. our 5 levels) |
| **No baseline preservation** | Can't compare "original plan" vs. "current state" |
| **No health scoring** | No automated "portfolio health" metric |
| **No BAU buffer concept** | Can't reserve capacity for unplanned work |
| **Sprint/continuous focus** | Optimized for flow, not quarterly commitments |
| **No overlooked tracking** | Doesn't flag items repeatedly pushed back |

### The Fundamental Mismatch

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│   KANBAN PHILOSOPHY              vs.    QUARTERLY PLANNING NEEDS        │
│   ==================                    ========================        │
│                                                                         │
│   "Optimize flow of work"               "Commit to quarterly goals"     │
│   "No fixed time-boxes"                 "12-week planning horizon"      │
│   "Pull when ready"                     "Pre-allocate capacity"         │
│   "Limit WIP at any moment"             "Total capacity per quarter"    │
│   "Continuous delivery"                 "Milestone-based delivery"      │
│   "Team-level board"                    "Portfolio-wide visibility"     │
│   "What's blocked today?"               "Are we on track for Q1?"       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Kanban answers:** "How do we move tasks efficiently through our workflow?"  
**Portfolio planning answers:** "Do we have capacity for our quarterly commitments?"

These are **both valid questions**—but they require **different tools**.

### Why "Just Use Jira" Doesn't Work

| Attempt | Reality |
|---------|---------|
| "Add capacity planning to Jira" | Requires Advanced Roadmaps (Premium $$$) + complex setup |
| "Use story points for effort" | Story points ≠ staff-weeks; different mental model |
| "Create custom hierarchy" | Jira supports ~3 levels; we need 5 |
| "Build health dashboards" | Requires external tools (Tableau, custom dev) |
| "Track baseline estimates" | Not native; needs plugins or workarounds |
| "Define BAU buffers" | No concept of reserved capacity in Kanban |

### The Right Question

Instead of "Should we use Jira Kanban for work planning?"  
Ask: "**What problem are we solving?**"

| Problem | Best Tool |
|---------|-----------|
| "What should I work on today?" | Jira Kanban ✅ |
| "Is this task blocked?" | Jira Kanban ✅ |
| "How fast are we completing tasks?" | Jira Kanban ✅ |
| "Do we have capacity for Q1 commitments?" | Portfolio Manager ✅ |
| "Which teams are over-committed?" | Portfolio Manager ✅ |
| "How healthy is our workplan?" | Portfolio Manager ✅ |
| "Are initiatives slipping vs. baseline?" | Portfolio Manager ✅ |

---

## 3. Pillar-by-Pillar Analysis: Which Tool Fits Best?

Our work is organized into four distinct pillars, each with unique characteristics. Here's how each pillar aligns with Portfolio Manager vs. Jira Kanban:

### Our Work Pillars Overview

| Pillar | Nature | Duration | Cadence |
|--------|--------|----------|---------|
| **Portfolio Monitoring & Analytics** | Routines + Ad hoc responsive | Days – Weeks | Management routines |
| **Prediction Tools** | Capability building & development | Weeks – Months | Project-based |
| **Portfolio Strategy** | Maintenance, Analysis, Research | Days – Weeks | Management routines |
| **Production Management** | Operative execution | Hours – Days | Continuous |

---

### 3.1 Portfolio Monitoring & Analytics

**Nature:** Continuous KPI tracking, risk monitoring, opportunity analysis  
**Duration:** Days to weeks  
**Cadence:** Routines + Ad hoc responsive, tied to management routines

```
┌─────────────────────────────────────────────────────────────────────────┐
│  PORTFOLIO MONITORING & ANALYTICS                                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ✅ PORTFOLIO MANAGER PROS           │  ❌ PORTFOLIO MANAGER CONS       │
│  ─────────────────────────────────   │  ─────────────────────────────   │
│  • Links work to management          │  • May feel heavy for quick      │
│    routines and quarterly goals      │    ad hoc items                  │
│  • Tracks effort over days/weeks     │  • Requires discipline to        │
│  • Visibility to leadership          │    log short-duration work       │
│  • Health scoring for ongoing        │                                  │
│    monitoring initiatives            │                                  │
│  • Audit trail for risk items        │                                  │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ✅ JIRA KANBAN PROS                 │  ❌ JIRA KANBAN CONS             │
│  ─────────────────────────────────   │  ─────────────────────────────   │
│  • Good for ad hoc responsive        │  • No link to quarterly          │
│    tasks (quick ticket creation)     │    capacity or goals             │
│  • Visual board for daily work       │  • Hard to roll up to            │
│                                       │    management-level view         │
│                                       │  • No effort variance tracking   │
│                                       │  • Separate from planning        │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Verdict:** 🏆 **Portfolio Manager** — Work is tied to management routines and needs quarterly visibility. Ad hoc items can be captured as tasks within initiatives.

---

### 3.2 Prediction Tools

**Nature:** Capability building, development of new prediction abilities  
**Duration:** Weeks to months  
**Cadence:** Project-based, longer-term initiatives

```
┌─────────────────────────────────────────────────────────────────────────┐
│  PREDICTION TOOLS                                                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ✅ PORTFOLIO MANAGER PROS           │  ❌ PORTFOLIO MANAGER CONS       │
│  ─────────────────────────────────   │  ─────────────────────────────   │
│  • Designed for weeks-months         │  • Less suited for detailed      │
│    initiatives                       │    daily dev task tracking       │
│  • Capacity planning critical        │                                  │
│    for multi-week projects           │                                  │
│  • Baseline vs. actual effort        │                                  │
│    tracking essential                │                                  │
│  • ETA tracking and slip alerts      │                                  │
│  • Definition of Done enforcement    │                                  │
│  • Cross-quarter visibility          │                                  │
│  • Hierarchy: fits naturally in      │                                  │
│    Asset Class → Target → Init       │                                  │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ✅ JIRA KANBAN PROS                 │  ❌ JIRA KANBAN CONS             │
│  ─────────────────────────────────   │  ─────────────────────────────   │
│  • Could track dev subtasks          │  • No capacity planning          │
│    if using Epics                    │  • Story points ≠ staff-weeks    │
│  • Good for code review flow         │  • Loses quarterly context       │
│                                       │  • No baseline tracking          │
│                                       │  • Requires Epics + complex      │
│                                       │    structure to approximate      │
│                                       │  • Multi-month visibility weak   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Verdict:** 🏆 **Portfolio Manager (strongly)** — Multi-week/month capability projects need capacity planning, effort tracking, and quarterly visibility. This is exactly what the tool is designed for.

---

### 3.3 Portfolio Strategy

**Nature:** Strategic oversight, constraints, optimization, partner onboarding, new products  
**Duration:** Days to weeks  
**Cadence:** Maintenance routines, management-driven, cross-company support

```
┌─────────────────────────────────────────────────────────────────────────┐
│  PORTFOLIO STRATEGY                                                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ✅ PORTFOLIO MANAGER PROS           │  ❌ PORTFOLIO MANAGER CONS       │
│  ─────────────────────────────────   │  ─────────────────────────────   │
│  • Strategic work needs              │  • Quick analysis tasks may      │
│    leadership visibility             │    feel over-structured          │
│  • Cross-company initiatives         │                                  │
│    require portfolio-level view      │                                  │
│  • Tracks partner ramp-up as         │                                  │
│    initiatives with ETAs             │                                  │
│  • Links to quarterly goals          │                                  │
│  • Dependency tracking for           │                                  │
│    cross-team work                   │                                  │
│  • Supports research/analysis        │                                  │
│    phases with effort estimates      │                                  │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ✅ JIRA KANBAN PROS                 │  ❌ JIRA KANBAN CONS             │
│  ─────────────────────────────────   │  ─────────────────────────────   │
│  • Quick to create ad hoc tasks      │  • No strategic overview         │
│  • Good for tracking individual      │  • Misses cross-company          │
│    analysis items                    │    context                       │
│                                       │  • Leadership won't look at      │
│                                       │    Kanban board                  │
│                                       │  • Can't track partner           │
│                                       │    onboarding milestones         │
│                                       │  • No effort roll-up             │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Verdict:** 🏆 **Portfolio Manager** — Strategic work is inherently tied to management visibility and cross-company coordination. Kanban is too tactical for this pillar.

---

### 3.4 Production Management

**Nature:** Operative execution, technical operations, QA  
**Duration:** Hours to a few days  
**Cadence:** Continuous, high-volume

```
┌─────────────────────────────────────────────────────────────────────────┐
│  PRODUCTION MANAGEMENT                                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ✅ PORTFOLIO MANAGER PROS           │  ❌ PORTFOLIO MANAGER CONS       │
│  ─────────────────────────────────   │  ─────────────────────────────   │
│  • Could track high-level            │  • Too heavy for hour-long       │
│    production capacity               │    tasks                         │
│  • BAU buffer concept helps          │  • Not optimized for high-       │
│    reserve time for ops              │    volume ticket flow            │
│                                       │  • No visual board for quick     │
│                                       │    status updates                │
│                                       │  • Overkill for short items      │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ✅ JIRA KANBAN PROS                 │  ❌ JIRA KANBAN CONS             │
│  ─────────────────────────────────   │  ─────────────────────────────   │
│  • PERFECT FIT: short tasks,         │  • Separate from quarterly       │
│    visual workflow                   │    planning view                 │
│  • WIP limits prevent overload       │                                  │
│  • Drag-and-drop status updates      │                                  │
│  • Cycle time metrics                │                                  │
│  • Already in use for production     │                                  │
│  • High-volume throughput            │                                  │
│  • QA workflows built-in             │                                  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Verdict:** 🏆 **Jira Kanban** — This is exactly what Kanban was designed for: short, operative tasks with high volume and visual flow. Continue using Jira here.

---

### Summary: Tool Fit by Pillar

| Pillar | Duration | Best Tool | Why |
|--------|----------|-----------|-----|
| **Portfolio Monitoring & Analytics** | Days–Weeks | Portfolio Manager | Tied to management routines, needs quarterly visibility |
| **Prediction Tools** | Weeks–Months | Portfolio Manager | Capacity planning essential for multi-week capability work |
| **Portfolio Strategy** | Days–Weeks | Portfolio Manager | Strategic, cross-company, leadership visibility required |
| **Production Management** | Hours–Days | Jira Kanban | Operative, high-volume, visual workflow |

### Visual: The Right Tool for Each Pillar

```
                                    DURATION
                    ◄────────────────────────────────────────►
                    Hours        Days        Weeks        Months
                      │           │            │            │
                      │           │            │            │
    Production        │███████████│            │            │
    Management        │   JIRA    │            │            │
                      │  KANBAN   │            │            │
                      │           │            │            │
    Portfolio         │           │████████████│████████████│
    Monitoring        │           │  PORTFOLIO │  MANAGER   │
                      │           │            │            │
    Portfolio         │           │████████████│████████████│
    Strategy          │           │  PORTFOLIO │  MANAGER   │
                      │           │            │            │
    Prediction        │           │            │████████████│████████████
    Tools             │           │            │  PORTFOLIO │  MANAGER
                      │           │            │            │
                      ▼           ▼            ▼            ▼
                 TACTICAL                              STRATEGIC
                 (Jira)                          (Portfolio Manager)
```

### The Complementary Approach

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│     PORTFOLIO WORK PLAN MANAGER              JIRA KANBAN                │
│     ═══════════════════════════              ══════════════             │
│                                                                         │
│     ┌─────────────────────────┐              ┌─────────────────────┐   │
│     │ Portfolio Monitoring    │              │                     │   │
│     │ & Analytics            │              │                     │   │
│     └─────────────────────────┘              │                     │   │
│     ┌─────────────────────────┐              │   Production        │   │
│     │ Prediction Tools        │              │   Management        │   │
│     └─────────────────────────┘              │                     │   │
│     ┌─────────────────────────┐              │   (Hours–Days)      │   │
│     │ Portfolio Strategy      │              │                     │   │
│     └─────────────────────────┘              └─────────────────────┘   │
│                                                                         │
│     (Days–Weeks–Months)                      ✓ Already in place        │
│     ✓ Planning & Capacity                    ✓ Proven workflow         │
│     ✓ Leadership visibility                  ✓ Team adoption           │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. What Portfolio Work Plan Manager Delivers

### 2.1 Capacity Management (Not Available in Jira)

```
┌─────────────────────────────────────────────────────────┐
│  QUARTERLY CAPACITY DASHBOARD                           │
├─────────────────────────────────────────────────────────┤
│  Team Lead: Sarah Chen                                  │
│  ├── Base Capacity:     12 staff-weeks                  │
│  ├── Adjustments:       -2 weeks (PTO, training)        │
│  ├── Available:         10 staff-weeks                  │
│  ├── Committed (WP):     7 staff-weeks (70%)            │
│  ├── BAU Buffer:         2 staff-weeks (20%)            │
│  └── Remaining:          1 staff-week  (10%)            │
│                                                         │
│  Status: ✅ Healthy                                     │
└─────────────────────────────────────────────────────────┘
```

**Key Capabilities:**
- Team capacity defined in staff-weeks per quarter
- BAU buffer allocation (protecting time for unplanned work)
- Real-time load calculation across all initiatives
- Early warning when teams are over-committed

### 2.2 Portfolio Hierarchy (5-Level Structure)

Our work is organized hierarchically—something Jira's flat structure doesn't support natively:

```
Asset Class (L1)
└── Pillar (L2)
    └── Responsibility (L3)
        └── Target (L4)
            └── Initiative (L5)
                └── Tasks
```

**Example:**
```
PL (Personal Loans)
└── Risk Management
    └── Model Development
        └── Q1 2026 Refresh
            └── Update Underwriting Model v3.2
                ├── Task: Data preparation
                ├── Task: Model training
                └── Task: Validation & documentation
```

This structure enables:
- Roll-up views by Asset Class, Pillar, or Responsibility
- Clear ownership at each level
- Consistent taxonomy across the portfolio

### 2.3 Effort Tracking & Variance Analysis

| Metric | Description | Jira Equivalent |
|--------|-------------|-----------------|
| **Estimated Effort** | Planned staff-weeks | Story points (different unit) |
| **Actual Effort** | Consumed staff-weeks | Time tracking (requires config) |
| **Baseline Tracking** | Original estimate preserved | Not native |
| **Variance Alerts** | Auto-flag when actuals exceed plan | Requires automation rules |
| **Overlooked Count** | Track repeated ETA slips | Not available |

### 2.4 Workplan Health Scoring

Automated health assessment that slides can't provide:

```
┌─────────────────────────────────────────────────────────┐
│  WORKPLAN HEALTH SCORE: 78/100                          │
├─────────────────────────────────────────────────────────┤
│  Schedule Score:    82  ████████░░  On-track ETAs       │
│  Effort Score:      71  ███████░░░  Minor overruns      │
│  Risk Score:        85  ████████░░  Few at-risk items   │
│  Compliance Score:  74  ███████░░░  Some missing DoDs   │
├─────────────────────────────────────────────────────────┤
│  Trend: ↗ +3 points from last week                      │
└─────────────────────────────────────────────────────────┘
```

**Health tracking includes:**
- Weekly snapshots for trend analysis
- Automatic risk detection (ETA slips, effort overruns)
- Compliance checks (Definition of Done, required fields)
- Historical comparison across quarters

### 2.5 Workflow Automation (Domain-Specific)

Built-in rules engine tailored to our planning process:

| Trigger | Condition | Action |
|---------|-----------|--------|
| ETA changes | Pushed back > 2 weeks | Auto-set "At Risk" status |
| Effort exceeds | Actual > 120% of estimated | Notify owner + flag |
| Weekly routine | Thursday EOD | Reminder for updates |
| Status change | → "At Risk" | Require Risk Action Log |

These rules would require extensive Jira automation configuration and ongoing maintenance.

---

## 5. How the Tools Work Together

```
┌─────────────────────────────────────────────────────────────────┐
│                     PLANNING & EXECUTION FLOW                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   QUARTERLY PLANNING              DAILY EXECUTION                │
│   (Portfolio Manager)             (Jira)                         │
│                                                                  │
│   ┌─────────────────┐            ┌─────────────────┐            │
│   │ Define          │            │ Create Jira     │            │
│   │ Initiatives     │ ────────►  │ Epics/Stories   │            │
│   │ & Capacity      │            │ for Execution   │            │
│   └─────────────────┘            └─────────────────┘            │
│          │                              │                        │
│          ▼                              ▼                        │
│   ┌─────────────────┐            ┌─────────────────┐            │
│   │ Track Effort    │            │ Track Tasks     │            │
│   │ at Initiative   │ ◄────────  │ & Sprints       │            │
│   │ Level           │   Sync     │                 │            │
│   └─────────────────┘            └─────────────────┘            │
│          │                              │                        │
│          ▼                              ▼                        │
│   ┌─────────────────┐            ┌─────────────────┐            │
│   │ Portfolio       │            │ Team            │            │
│   │ Health View     │            │ Kanban Board    │            │
│   └─────────────────┘            └─────────────────┘            │
│                                                                  │
│   WHO USES:                      WHO USES:                       │
│   • Leadership                   • Development Teams             │
│   • Portfolio Ops                • Production Teams              │
│   • Planning Leads               • Individual Contributors       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Clear Separation of Concerns

| Aspect | Portfolio Manager | Jira |
|--------|-------------------|------|
| **Time Horizon** | Quarter | Sprint/Day |
| **Granularity** | Initiative/Epic level | Task/Story level |
| **Primary Users** | Leadership, Portfolio Ops | Execution Teams |
| **Key Question** | "Are we on track for Q1?" | "What do I work on today?" |
| **Capacity Unit** | Staff-weeks | Story points / hours |

---

## 6. Feature Comparison Matrix

| Capability | Portfolio Manager | Jira Kanban | Notes |
|------------|:-----------------:|:-----------:|-------|
| **Quarterly capacity planning** | ✅ Native | ❌ Requires plugins | Advanced Roadmaps ($$$) |
| **5-level work hierarchy** | ✅ Built-in | ⚠️ Complex setup | Jira supports 2-3 levels max |
| **Staff-week effort tracking** | ✅ Native | ⚠️ Custom fields | Jira uses story points |
| **Baseline vs. actual variance** | ✅ Automatic | ❌ Manual | No native baseline tracking |
| **Health scoring** | ✅ Automated | ❌ Not available | Would need external tool |
| **BAU buffer management** | ✅ Per-team buffers | ❌ Not available | Critical for planning |
| **Overlooked item tracking** | ✅ Auto-count delays | ❌ Not available | Unique feature |
| **Role-based permissions** | ✅ 7 roles configured | ✅ Available | Both support this |
| **Kanban board** | ⚠️ Table view | ✅ Native | Jira's strength |
| **Sprint management** | ❌ Not designed for | ✅ Native | Different paradigm |
| **Production task tracking** | ⚠️ Basic | ✅ Excellent | Use Jira for this |
| **Audit trail** | ✅ Full history | ✅ Available | Both support this |

---

## 7. Cost of Migrating to Jira

If we attempted to replicate Portfolio Manager capabilities in Jira:

| Requirement | Jira Solution | Effort/Cost |
|-------------|---------------|-------------|
| Capacity planning | Advanced Roadmaps | Premium tier ($$$) |
| Custom hierarchy | Custom issue types + links | Significant config |
| Staff-week tracking | Custom fields + calculated fields | Development needed |
| Health scoring | External dashboard (Tableau, etc.) | Integration project |
| BAU buffers | Custom automation | Complex setup |
| Baseline tracking | Plugin or custom development | Additional cost |
| Domain-specific workflows | Automation rules | Ongoing maintenance |

**Estimated migration effort:** 3-6 months + ongoing maintenance  
**Estimated additional cost:** Premium Jira licenses + plugins + integration work

---

## 8. Recommendation

### Keep Both Tools—They Serve Different Purposes

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│   STRATEGIC PLANNING          TACTICAL EXECUTION             │
│   ==================          ==================             │
│                                                              │
│   Portfolio Work Plan         Jira                           │
│   Manager                                                    │
│                                                              │
│   • Quarterly planning        • Daily task management        │
│   • Capacity management       • Sprint execution             │
│   • Initiative tracking       • Production workflows         │
│   • Health monitoring         • Team collaboration           │
│   • Leadership visibility     • Developer tooling            │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Why This Approach Works

1. **Right tool for the job**: Each tool optimized for its purpose
2. **No disruption**: Jira continues supporting production as-is
3. **Immediate value**: Capacity management available now (vs. months of Jira config)
4. **Lower risk**: Proven solution vs. complex migration
5. **Cost effective**: Avoid Premium Jira tier and plugin costs

### Next Steps

1. **Pilot**: Run Q1 planning fully in Portfolio Manager
2. **Integrate**: Sync key initiatives to Jira for execution tracking
3. **Measure**: Compare planning accuracy vs. slides-based approach
4. **Report**: Present capacity and health metrics to leadership monthly

---

## Appendix A: Current vs. Future State

### Before (Slides-Based Planning)

```
❌ Capacity tracked in spreadsheets (if at all)
❌ Initiative status updated monthly in decks
❌ No automated health tracking
❌ Effort variance discovered at quarter-end
❌ No single source of truth
```

### After (Portfolio Manager + Jira)

```
✅ Real-time capacity visibility per team
✅ Initiative status always current
✅ Automated health scoring and alerts
✅ Effort variance flagged as it happens
✅ Portfolio Manager = Planning truth
✅ Jira = Execution truth
```

---

## Appendix B: Role-Based Access Summary

| Role | Primary Use | Key Permissions |
|------|-------------|-----------------|
| Admin | System configuration | Full access |
| SVP/VP | Portfolio oversight | View all, edit strategic items |
| Director (Dept) | Department planning | Manage department initiatives |
| Director (Group) | Group coordination | Manage group initiatives |
| Team Lead | Initiative ownership | Create/edit own initiatives |
| Portfolio Ops | Planning support | Cross-portfolio view and reporting |

---

*Document prepared for leadership review*  
*Portfolio Work Plan Manager v1.0*


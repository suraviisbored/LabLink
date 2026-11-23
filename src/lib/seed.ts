import type {
  AccessRequest,
  AuditEntry,
  Blackout,
  Booking,
  Campus,
  CampusSettings,
  Certification,
  Conflict,
  Department,
  EmailOutboxEntry,
  Equipment,
  EquipmentUnit,
  Lab,
  MaintenanceBlock,
  Notification,
  Profile,
  Project,
  Resolution,
  WaitlistEntry,
  ConflictOption,
} from "@/lib/types";
import { addDays, campusDate, campusLocalToUtc } from "@/lib/time";

/**
 * Demo dataset: two campuses so tenant isolation is demonstrable, multi-unit
 * equipment, a ready-made conflict, a faculty approval queue, and history that
 * makes the fairness factors differ. Dates are relative to `now`, so the demo
 * never goes stale.
 */

export const DEMO_CAMPUS_ID = "campus-demo";
export const RIVERSIDE_CAMPUS_ID = "campus-riverside";

export interface SeedData {
  campuses: Campus[];
  campusDomains: { domain: string; campusId: string }[];
  departments: Department[];
  labs: Lab[];
  blackouts: Blackout[];
  equipment: Equipment[];
  units: EquipmentUnit[];
  maintenance: MaintenanceBlock[];
  profiles: Profile[];
  projects: Project[];
  projectMembers: { projectId: string; userId: string; campusId: string; role: string }[];
  requests: AccessRequest[];
  bookings: Booking[];
  conflicts: Conflict[];
  notifications: Notification[];
  emailOutbox: EmailOutboxEntry[];
  audit: AuditEntry[];
  conflictOptions: ConflictOption[];
  resolutions: Resolution[];
  settings: CampusSettings[];
  waitlist: WaitlistEntry[];
  certifications: Certification[];
  userCertifications: { userId: string; certificationId: string; campusId: string; validUntil: string | null }[];
  fairnessLedger: { id: string; campusId: string; userId: string; event: string; delta: number; createdAt: string }[];
}

function dayAt(base: Date, daysFromNow: number, hour: number, minute = 0): string {
  const target = new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + daysFromNow),
  );
  return campusLocalToUtc(campusDate(target), hour, minute);
}

function atDay(base: Date, daysFromNow: number): string {
  const target = new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + daysFromNow),
  );
  return campusDate(target);
}

export function buildSeedData(now: Date = new Date()): SeedData {
  const base = new Date(now);
  const iso = base.toISOString();

  const campuses: Campus[] = [
    {
      id: DEMO_CAMPUS_ID,
      name: "Demo Campus",
      timezone: "Asia/Kolkata",
      allowedEmailDomains: ["demo.lablink.example"],
      isDemo: true,
      isActive: true,
    },
    {
      id: RIVERSIDE_CAMPUS_ID,
      name: "Riverside Institute",
      timezone: "Asia/Kolkata",
      allowedEmailDomains: ["riverside.edu.in"],
      isDemo: false,
      isActive: true,
    },
  ];

  const departments: Department[] = [
    { id: "dept-cs", campusId: DEMO_CAMPUS_ID, name: "Computer Science" },
    { id: "dept-ec", campusId: DEMO_CAMPUS_ID, name: "Electronics" },
    { id: "dept-design", campusId: DEMO_CAMPUS_ID, name: "Design" },
    { id: "dept-r-cs", campusId: RIVERSIDE_CAMPUS_ID, name: "Computer Science" },
  ];

  const labs: Lab[] = [
    {
      id: "lab-robotics",
      campusId: DEMO_CAMPUS_ID,
      departmentId: "dept-cs",
      name: "Robotics Lab",
      location: "CS Block, Room 204",
      availableFrom: "09:00",
      availableTo: "18:00",
      availableDays: [1, 2, 3, 4, 5, 6],
    },
    {
      id: "lab-electronics",
      campusId: DEMO_CAMPUS_ID,
      departmentId: "dept-ec",
      name: "Electronics Lab",
      location: "EC Block, Room 110",
      availableFrom: "10:00",
      availableTo: "17:00",
      availableDays: [1, 2, 3, 4, 5],
    },
    {
      id: "lab-fabrication",
      campusId: DEMO_CAMPUS_ID,
      departmentId: "dept-design",
      name: "Fabrication Lab",
      location: "Design Studio, Ground Floor",
      availableFrom: "09:00",
      availableTo: "17:00",
      availableDays: [1, 2, 3, 4, 5],
    },
    {
      id: "lab-r-robotics",
      campusId: RIVERSIDE_CAMPUS_ID,
      departmentId: "dept-r-cs",
      name: "Robotics Lab",
      location: "Block C, Room 12",
      availableFrom: "09:00",
      availableTo: "17:00",
      availableDays: [1, 2, 3, 4, 5],
    },
  ];

  const equipment: Equipment[] = [
    {
      id: "eq-jetson",
      campusId: DEMO_CAMPUS_ID,
      labId: "lab-robotics",
      name: "NVIDIA Jetson Orin Dev Kit",
      category: "Development Kit",
      description:
        "Edge AI development kit for vision and robotics coursework. Includes camera module and a 128 GB SSD.",
      specs: { compute: "275 TOPS", ram: "64 GB", camera: "8 MP", storage: "128 GB" },
      tags: ["ai", "edge", "vision"],
      requiresCertification: false,
      status: "available",
    },
    {
      id: "eq-arm",
      campusId: DEMO_CAMPUS_ID,
      labId: "lab-robotics",
      name: "UR5e Robot Arm",
      category: "Robot Arm",
      description:
        "Six-axis collaborative arm with a 5 kg payload. Requires the Robot Arm Safety certification.",
      specs: { payload: "5 kg", reach: "850 mm", axes: "6", repeatability: "±0.03 mm" },
      tags: ["robotics", "arm", "manipulation"],
      requiresCertification: true,
      status: "available",
    },
    {
      id: "eq-pi",
      campusId: DEMO_CAMPUS_ID,
      labId: "lab-robotics",
      name: "Raspberry Pi 5 Cluster",
      category: "Single Board Computer",
      description: "Four-node cluster for distributed systems and networking labs.",
      specs: { nodes: "4", ram: "8 GB per node", storage: "128 GB NVMe" },
      tags: ["cluster", "linux", "networking"],
      requiresCertification: false,
      status: "available",
    },
    {
      id: "eq-scope",
      campusId: DEMO_CAMPUS_ID,
      labId: "lab-electronics",
      name: "Rigol DS1054Z Oscilloscope",
      category: "Test Equipment",
      description: "Four-channel digital oscilloscope, 50 MHz bandwidth.",
      specs: { channels: "4", bandwidth: "50 MHz", sampleRate: "1 GSa/s" },
      tags: ["signals", "measurement"],
      requiresCertification: false,
      status: "available",
    },
    {
      id: "eq-prusa",
      campusId: DEMO_CAMPUS_ID,
      labId: "lab-fabrication",
      name: "Prusa MK4 3D Printer",
      category: "Fabrication",
      description: "FDM printer with a 0.4 mm nozzle, enclosure and filament dryer.",
      specs: { buildVolume: "250 x 210 x 220 mm", nozzle: "0.4 mm", materials: "PLA, PETG" },
      tags: ["printing", "prototype"],
      requiresCertification: false,
      status: "available",
    },
    {
      id: "eq-fpga",
      campusId: DEMO_CAMPUS_ID,
      labId: "lab-electronics",
      name: "Basys 3 FPGA Board",
      category: "FPGA",
      description: "Artix-7 FPGA trainer board for digital design labs.",
      specs: { logicCells: "33,280", io: "16 switches", clock: "100 MHz" },
      tags: ["digital", "verilog"],
      requiresCertification: false,
      status: "available",
    },
    {
      id: "eq-quest",
      campusId: DEMO_CAMPUS_ID,
      labId: "lab-robotics",
      name: "Meta Quest 3 Headset",
      category: "XR Hardware",
      description: "Standalone mixed-reality headset for interaction prototyping.",
      specs: { resolution: "2064 x 2208 per eye", refresh: "90 Hz", storage: "512 GB" },
      tags: ["xr", "prototype", "vision"],
      requiresCertification: false,
      status: "available",
    },
    {
      id: "eq-flir",
      campusId: DEMO_CAMPUS_ID,
      labId: "lab-electronics",
      name: "FLIR Thermal Camera",
      category: "Test Equipment",
      description: "Handheld thermal camera for PCB and thermal-runaway studies.",
      specs: { resolution: "160 x 120", accuracy: "±2 °C", range: "-10 to 400 °C" },
      tags: ["thermal", "measurement"],
      requiresCertification: false,
      status: "available",
    },
    {
      id: "eq-r-jetson",
      campusId: RIVERSIDE_CAMPUS_ID,
      labId: "lab-r-robotics",
      name: "NVIDIA Jetson Orin Dev Kit",
      category: "Development Kit",
      description: "Riverside Institute's own edge AI kit. Never visible from Demo Campus.",
      specs: { compute: "275 TOPS", ram: "64 GB" },
      tags: ["ai", "edge"],
      requiresCertification: false,
      status: "available",
    },
  ];

  const unitSpec = (equipmentId: string, prefix: string, count: number) =>
    Array.from({ length: count }, (_, index) => ({
      id: `${equipmentId}-u${index + 1}`,
      campusId: equipmentId.startsWith("eq-r-") ? RIVERSIDE_CAMPUS_ID : DEMO_CAMPUS_ID,
      equipmentId,
      assetTag: `${prefix}-${String(index + 1).padStart(2, "0")}`,
      status: "available" as const,
    }));

  const units: EquipmentUnit[] = [
    ...unitSpec("eq-jetson", "JET", 3),
    ...unitSpec("eq-arm", "ARM", 1),
    ...unitSpec("eq-pi", "PI", 4),
    ...unitSpec("eq-scope", "OSC", 5),
    ...unitSpec("eq-prusa", "PRN", 3),
    ...unitSpec("eq-fpga", "FPGA", 4),
    ...unitSpec("eq-quest", "XR", 2),
    ...unitSpec("eq-flir", "FLIR", 2),
    ...unitSpec("eq-r-jetson", "RJET", 1),
  ];

  // Third Jetson unit is down, which is what makes the seeded conflict real.
  const jetsonThird = units.find((unit) => unit.id === "eq-jetson-u3");
  if (jetsonThird) jetsonThird.status = "maintenance";

  // The conflict sits on a weekday a few days out so the demo is always "next".
  let conflictOffset = 3;
  while ([0, 1, 2].includes(new Date(`${atDay(base, conflictOffset)}T00:00:00Z`).getUTCDay())) {
    conflictOffset += 1;
  }
  const conflictDate = atDay(base, conflictOffset);
  const conflictStart = dayAt(base, conflictOffset, 10);
  const conflictEnd = dayAt(base, conflictOffset, 16);
  void conflictDate;

  const maintenance: MaintenanceBlock[] = [
    {
      id: "maint-jetson-3",
      campusId: DEMO_CAMPUS_ID,
      unitId: "eq-jetson-u3",
      startTime: dayAt(base, conflictOffset, 9),
      endTime: dayAt(base, conflictOffset, 18),
      reason: "Carrier board replacement",
    },
    {
      id: "maint-scope-5",
      campusId: DEMO_CAMPUS_ID,
      unitId: "eq-scope-u5",
      startTime: dayAt(base, conflictOffset, 9),
      endTime: dayAt(base, conflictOffset + 2, 18),
      reason: "Calibration",
    },
  ];

  const blackouts: Blackout[] = [
    {
      id: "blackout-fab",
      campusId: DEMO_CAMPUS_ID,
      labId: "lab-fabrication",
      startTime: dayAt(base, 2, 13),
      endTime: dayAt(base, 2, 17),
      reason: "Ventilation servicing",
    },
  ];

  const profiles: Profile[] = [
    {
      id: "user-aarav",
      campusId: DEMO_CAMPUS_ID,
      name: "Aarav Sharma",
      email: "student@demo.lablink.example",
      role: "student",
      departmentId: "dept-cs",
      emailNotifications: true,
    },
    {
      id: "user-priya",
      campusId: DEMO_CAMPUS_ID,
      name: "Priya Nair",
      email: "priya@demo.lablink.example",
      role: "student",
      departmentId: "dept-cs",
      emailNotifications: true,
    },
    {
      id: "user-rohan",
      campusId: DEMO_CAMPUS_ID,
      name: "Rohan Das",
      email: "rohan@demo.lablink.example",
      role: "student",
      departmentId: "dept-ec",
      emailNotifications: true,
    },
    {
      id: "user-neha",
      campusId: DEMO_CAMPUS_ID,
      name: "Neha Kulkarni",
      email: "neha@demo.lablink.example",
      role: "student",
      departmentId: "dept-design",
      emailNotifications: false,
    },
    {
      id: "user-meera",
      campusId: DEMO_CAMPUS_ID,
      name: "Dr. Meera Iyer",
      email: "faculty@demo.lablink.example",
      role: "faculty",
      departmentId: "dept-cs",
      emailNotifications: true,
    },
    {
      id: "user-sana",
      campusId: DEMO_CAMPUS_ID,
      name: "Sana Qureshi",
      email: "admin@demo.lablink.example",
      role: "campus_admin",
      departmentId: null,
      emailNotifications: true,
    },
    {
      id: "user-kiran",
      campusId: RIVERSIDE_CAMPUS_ID,
      name: "Kiran Rao",
      email: "kiran@riverside.edu.in",
      role: "student",
      departmentId: "dept-r-cs",
      emailNotifications: true,
    },
    {
      id: "user-vikram",
      campusId: RIVERSIDE_CAMPUS_ID,
      name: "Vikram Shetty",
      email: "vikram@riverside.edu.in",
      role: "campus_admin",
      departmentId: null,
      emailNotifications: true,
    },
    {
      id: "user-platform",
      campusId: null,
      name: "Platform Admin",
      email: "platform@lablink.example",
      role: "super_admin",
      departmentId: null,
      emailNotifications: false,
    },
  ];

  const projects: Project[] = [
    {
      id: "proj-rover",
      campusId: DEMO_CAMPUS_ID,
      studentId: "user-aarav",
      facultyId: "user-meera",
      title: "Autonomous Rover for Campus Navigation",
      description:
        "A four-wheel rover that maps the CS corridor and avoids obstacles using onboard vision.",
      deadline: dayAt(base, 9, 18),
      status: "active",
      createdAt: iso,
    },
    {
      id: "proj-crop",
      campusId: DEMO_CAMPUS_ID,
      studentId: "user-priya",
      facultyId: "user-meera",
      title: "Vision-based Crop Disease Detection",
      description: "Classify leaf disease from images captured on a phone, on-device.",
      deadline: dayAt(base, 4, 18),
      status: "active",
      createdAt: iso,
    },
    {
      id: "proj-drone",
      campusId: DEMO_CAMPUS_ID,
      studentId: "user-rohan",
      facultyId: "user-meera",
      title: "Gesture-controlled Drone",
      description: "Control a micro-drone with hand gestures recognised on an edge device.",
      deadline: dayAt(base, 2, 18),
      status: "active",
      createdAt: iso,
    },
    {
      id: "proj-kiosk",
      campusId: DEMO_CAMPUS_ID,
      studentId: "user-neha",
      facultyId: "user-meera",
      title: "Edge AI Attendance Kiosk",
      description: "A door-mounted kiosk that marks attendance without a network round trip.",
      deadline: dayAt(base, 6, 18),
      status: "active",
      createdAt: iso,
    },
    {
      id: "proj-safety",
      campusId: DEMO_CAMPUS_ID,
      studentId: "user-neha",
      facultyId: "user-meera",
      title: "Lab Safety Vision Model",
      description: "Flag missing safety glasses in the fabrication lab from camera frames.",
      deadline: dayAt(base, 12, 18),
      status: "active",
      createdAt: iso,
    },
  ];

  const requests: AccessRequest[] = [
    {
      id: "req-aarav-conflict",
      campusId: DEMO_CAMPUS_ID,
      projectId: "proj-rover",
      equipmentId: "eq-jetson",
      hoursNeeded: 4,
      windowStart: conflictStart,
      windowEnd: conflictEnd,
      justification:
        "On-device vision pipeline must be profiled on the same Jetson model we will ship with.",
      status: "approved",
      priority: "high",
      reviewedBy: "user-meera",
      reviewNote: "High priority: this is the demo deliverable for the review.",
      version: 2,
      createdAt: addDays(iso, -2),
    },
    {
      id: "req-priya-conflict",
      campusId: DEMO_CAMPUS_ID,
      projectId: "proj-crop",
      equipmentId: "eq-jetson",
      hoursNeeded: 4,
      windowStart: conflictStart,
      windowEnd: conflictEnd,
      justification: "Quantise and benchmark the classifier on the Jetson before the review.",
      status: "approved",
      priority: "normal",
      reviewedBy: "user-meera",
      reviewNote: "Approved for the requested window.",
      version: 2,
      createdAt: addDays(iso, -2),
    },
    {
      id: "req-rohan-conflict",
      campusId: DEMO_CAMPUS_ID,
      projectId: "proj-drone",
      equipmentId: "eq-jetson",
      hoursNeeded: 4,
      windowStart: conflictStart,
      windowEnd: conflictEnd,
      justification: "Gesture model latency tests need the edge device for the full window.",
      status: "approved",
      priority: "normal",
      reviewedBy: "user-meera",
      reviewNote: "Approved; deadline is close.",
      version: 2,
      createdAt: addDays(iso, -1),
    },
    {
      id: "req-neha-conflict",
      campusId: DEMO_CAMPUS_ID,
      projectId: "proj-kiosk",
      equipmentId: "eq-jetson",
      hoursNeeded: 2,
      windowStart: conflictStart,
      windowEnd: conflictEnd,
      justification: "Short smoke test of the kiosk build on real hardware.",
      status: "approved",
      priority: "normal",
      reviewedBy: "user-meera",
      reviewNote: "Approved for two hours.",
      version: 2,
      createdAt: addDays(iso, -1),
    },
    {
      id: "req-neha-prusa",
      campusId: DEMO_CAMPUS_ID,
      projectId: "proj-safety",
      equipmentId: "eq-prusa",
      hoursNeeded: 6,
      windowStart: dayAt(base, 1, 9),
      windowEnd: dayAt(base, 5, 17),
      justification: "Print four camera mounts and two enclosure brackets.",
      status: "submitted",
      priority: "normal",
      reviewedBy: null,
      reviewNote: null,
      version: 1,
      createdAt: iso,
    },
    {
      id: "req-rohan-arm",
      campusId: DEMO_CAMPUS_ID,
      projectId: "proj-drone",
      equipmentId: "eq-arm",
      hoursNeeded: 4,
      windowStart: dayAt(base, 2, 9),
      windowEnd: dayAt(base, 2, 17),
      justification: "Mount the gesture sensor on the arm for a calibration sweep.",
      status: "submitted",
      priority: "normal",
      reviewedBy: null,
      reviewNote: null,
      version: 1,
      createdAt: iso,
    },
    {
      id: "req-kiran",
      campusId: RIVERSIDE_CAMPUS_ID,
      projectId: "proj-kiran",
      equipmentId: "eq-r-jetson",
      hoursNeeded: 3,
      windowStart: dayAt(base, 1, 9),
      windowEnd: dayAt(base, 3, 17),
      justification: "Riverside-only request used by the tenant isolation tests.",
      status: "submitted",
      priority: "normal",
      reviewedBy: null,
      reviewNote: null,
      version: 1,
      createdAt: iso,
    },
  ];

  const projectsWithRiverside: Project[] = [
    ...projects,
    {
      id: "proj-kiran",
      campusId: RIVERSIDE_CAMPUS_ID,
      studentId: "user-kiran",
      facultyId: null,
      title: "Riverside Edge Vision",
      description: "Riverside-only project used by the tenant isolation tests.",
      deadline: dayAt(base, 15, 18),
      status: "active",
      createdAt: iso,
    },
  ];

  const bookings: Booking[] = [
    {
      id: "book-aarav-jetson",
      campusId: DEMO_CAMPUS_ID,
      unitId: "eq-jetson-u1",
      equipmentId: "eq-jetson",
      userId: "user-aarav",
      requestId: null,
      seriesId: null,
      startTime: dayAt(base, 1, 9),
      endTime: dayAt(base, 1, 11),
      status: "confirmed",
      checkedInAt: null,
      idempotencyKey: "seed-aarav-jetson-1",
      version: 1,
      createdAt: addDays(iso, -1),
    },
    {
      id: "book-priya-prusa",
      campusId: DEMO_CAMPUS_ID,
      unitId: "eq-prusa-u1",
      equipmentId: "eq-prusa",
      userId: "user-priya",
      requestId: null,
      seriesId: null,
      startTime: dayAt(base, 2, 10),
      endTime: dayAt(base, 2, 12),
      status: "confirmed",
      checkedInAt: null,
      idempotencyKey: "seed-priya-prusa-1",
      version: 1,
      createdAt: addDays(iso, -1),
    },
    {
      id: "book-aarav-pi-past",
      campusId: DEMO_CAMPUS_ID,
      unitId: "eq-pi-u1",
      equipmentId: "eq-pi",
      userId: "user-aarav",
      requestId: null,
      seriesId: null,
      startTime: dayAt(base, -5, 9),
      endTime: dayAt(base, -5, 12),
      status: "completed",
      checkedInAt: dayAt(base, -5, 9),
      idempotencyKey: "seed-aarav-pi-1",
      version: 1,
      createdAt: addDays(iso, -6),
    },
    {
      id: "book-rohan-noshow",
      campusId: DEMO_CAMPUS_ID,
      unitId: "eq-jetson-u2",
      equipmentId: "eq-jetson",
      userId: "user-rohan",
      requestId: null,
      seriesId: null,
      startTime: dayAt(base, -4, 10),
      endTime: dayAt(base, -4, 12),
      status: "no_show",
      checkedInAt: null,
      idempotencyKey: "seed-rohan-noshow-1",
      version: 2,
      createdAt: addDays(iso, -5),
    },
    {
      id: "book-priya-scope-past",
      campusId: DEMO_CAMPUS_ID,
      unitId: "eq-scope-u1",
      equipmentId: "eq-scope",
      userId: "user-priya",
      requestId: null,
      seriesId: null,
      startTime: dayAt(base, -1, 10),
      endTime: dayAt(base, -1, 11),
      status: "completed",
      checkedInAt: dayAt(base, -1, 10),
      idempotencyKey: "seed-priya-scope-1",
      version: 1,
      createdAt: addDays(iso, -2),
    },
  ];

  const conflicts: Conflict[] = [
    {
      id: "conflict-jetson",
      campusId: DEMO_CAMPUS_ID,
      equipmentId: "eq-jetson",
      windowStart: conflictStart,
      windowEnd: conflictEnd,
      requestIds: [
        "req-aarav-conflict",
        "req-priya-conflict",
        "req-rohan-conflict",
        "req-neha-conflict",
      ],
      status: "open",
      version: 1,
      createdAt: iso,
    },
  ];

  const notifications: Notification[] = [
    {
      id: "notif-1",
      campusId: DEMO_CAMPUS_ID,
      userId: "user-aarav",
      type: "request_approved",
      title: "Request approved",
      body: "Dr. Meera Iyer approved your Jetson request (4 h, high priority).",
      link: "/requests/req-aarav-conflict",
      read: false,
      createdAt: addDays(iso, -1),
    },
    {
      id: "notif-2",
      campusId: DEMO_CAMPUS_ID,
      userId: "user-aarav",
      type: "conflict_detected",
      title: "Demand exceeds capacity for your Jetson window",
      body: "Four approved requests need more hours than the lab can supply. A staff decision is pending.",
      link: "/requests/req-aarav-conflict",
      read: false,
      createdAt: iso,
    },
    {
      id: "notif-3",
      campusId: DEMO_CAMPUS_ID,
      userId: "user-aarav",
      type: "booking_confirmed",
      title: "Booking confirmed",
      body: "Jetson Orin Dev Kit (JET-01) is booked for you.",
      link: "/bookings",
      read: true,
      createdAt: addDays(iso, -1),
    },
  ];

  const settings: CampusSettings[] = [
    {
      campusId: DEMO_CAMPUS_ID,
      weeklyHoursQuota: 10,
      cancelCutoffHours: 2,
      graceMinutes: 15,
      fairnessWeights: {
        deadline: 0.35,
        priority: 0.25,
        recentUsage: 0.2,
        hoursEfficiency: 0.1,
        reliability: 0.1,
      },
    },
    {
      campusId: RIVERSIDE_CAMPUS_ID,
      weeklyHoursQuota: 8,
      cancelCutoffHours: 4,
      graceMinutes: 20,
      fairnessWeights: {
        deadline: 0.35,
        priority: 0.25,
        recentUsage: 0.2,
        hoursEfficiency: 0.1,
        reliability: 0.1,
      },
    },
  ];

  const audit: AuditEntry[] = [
    {
      id: "audit-1",
      campusId: DEMO_CAMPUS_ID,
      actorId: "user-meera",
      action: "request.approved",
      entity: "access_requests",
      entityId: "req-aarav-conflict",
      metadata: { priority: "high" },
      createdAt: addDays(iso, -1),
    },
    {
      id: "audit-2",
      campusId: DEMO_CAMPUS_ID,
      actorId: "user-aarav",
      action: "booking.created",
      entity: "bookings",
      entityId: "book-aarav-jetson",
      metadata: { unitId: "eq-jetson-u1" },
      createdAt: addDays(iso, -1),
    },
  ];

  return {
    campuses,
    campusDomains: campuses.flatMap((campus) =>
      campus.allowedEmailDomains.map((domain) => ({ domain, campusId: campus.id })),
    ),
    departments,
    labs,
    blackouts,
    equipment,
    units,
    maintenance,
    profiles,
    projects: projectsWithRiverside,
    projectMembers: [],
    requests,
    bookings,
    conflicts,
    notifications,
    emailOutbox: [],
    audit,
    conflictOptions: [],
    resolutions: [],
    settings,
    waitlist: [],
    certifications: [
      { id: "cert-arm", campusId: DEMO_CAMPUS_ID, name: "Robot Arm Safety" },
    ],
    userCertifications: [],
    fairnessLedger: [],
  };
}

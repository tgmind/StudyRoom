import { PublicWebsiteContent } from "./types";

export const DEFAULT_PUBLIC_CONTENT: PublicWebsiteContent = {
  general: {
    title: "Study Room — Study Together • Grow Together",
    tagline: "Live group study, built for consistency.",
    description:
      "A focused virtual study platform for serious students who want accountability, live synchronization, and real study-time tracking — without talking, discussion, or video-call distractions.",
    contactEmail: "studyaliveapp@gmail.com",
    contactPhone: "",
    supportInfo: "Assistance available daily for student onboarding and payment verification inquiries.",
    socialLinks: {
      telegram: "https://t.me/studyroom_community",
    },
  },
  branding: {
    logoText: "Study Room",
    logoIcon: "👥",
    qrCodeDriveUrl: "https://drive.google.com/file/d/16hdJsPDWQ6_S8i9HiAVw1Wxn36bT--M0/view?usp=sharing",
    heroImageDriveUrl: "",
    featureImageDriveUrl: "",
  },
  hero: {
    badge: "🔵 SERIOUS SELF-STUDY • GROUP ENVIRONMENT",
    headlineMain: "LIVE GROUP STUDY,",
    headlineHighlight: "BUILT FOR CONSISTENCY.",
    description:
      "A silent, high-accountability virtual room where students study together in real time. Track actual focused hours, conquer rolling 20-hour goals, and duel with peers in the live Rivalry Arena.",
    ctaPrimaryText: "Join Study Room — ₹50",
    ctaSecondaryText: "Explore Features",
    pills: [
      "🎯 20-Hour Goals",
      "⏱️ Server-Synced Timer",
      "⚔️ Rivalry Arena",
      "📈 Weekly Leaderboard",
      "🔥 Streak Heatmap",
    ],
  },
  howItWorks: [
    {
      stepNumber: 1,
      title: "Join Study Room",
      description: "Scan the ₹50 UPI QR code, submit your transaction UTR, and proceed to account registration.",
      icon: "📲",
    },
    {
      stepNumber: 2,
      title: "Enter the Live Room",
      description: "Step into the focused virtual study room and see active peers studying in real time.",
      icon: "🚪",
    },
    {
      stepNumber: 3,
      title: "Set Goals & Start Timer",
      description: "Pick your subject, set a rolling 20-hour milestone, and start your server-synchronized timer.",
      icon: "⏱️",
    },
    {
      stepNumber: 4,
      title: "Compete & Build Habit",
      description: "Trigger Rivalry Arena duels when study hours converge, earn streaks, and claim the weekly Achiever Title.",
      icon: "🏆",
    },
  ],
  features: [
    {
      id: "timer",
      icon: "⏱️",
      title: "Server-Authoritative Live Timer",
      description:
        "Every second is synchronized against atomic server time via /api/time to eliminate device clock manipulation. Start, pause, take structured breaks, and record genuine study time.",
      category: "LIVE STUDY",
    },
    {
      id: "presence",
      icon: "👥",
      title: "Live Peer Presence & Status",
      description:
        "Know you are not alone. See fellow students actively studying with glowing live status indicators, break countdowns, and recent session achievements across the platform.",
      category: "REALTIME EXPERIENCE",
    },
    {
      id: "goals",
      icon: "🎯",
      title: "Rolling 20-Hour Goals",
      description:
        "Break free from rigid midnight resets. Set flexible 20-hour target goals for questions solved or hours logged. Track your target progress seamlessly mid-session.",
      category: "PROGRESS",
    },
    {
      id: "rivalry",
      icon: "⚔️",
      title: "Live Rivalry Arena (Duel & Tri-Clash)",
      description:
        "StudyRoom intelligently matches students in close proximity into live Duels or Tri-Clashes based on genuine study time or leaderboard rank — driven entirely by real study without artificial points.",
      category: "MOTIVATION",
    },
    {
      id: "leaderboard",
      icon: "🏆",
      title: "Weekly Rankings & Achiever Badge",
      description:
        "Study hours accumulate toward the weekly leaderboard starting Monday 00:00 IST. The top student claims the coveted Achiever Badge to celebrate consistent hard work.",
      category: "MOTIVATION",
    },
    {
      id: "privacy",
      icon: "🔒",
      title: "100% Privacy & Zero Distraction",
      description:
        "No webcam video feeds, no intrusive microphones, no distracting group chat. Pure academic atmosphere that preserves your privacy while providing silent peer accountability.",
      category: "SYSTEM & PRIVACY",
    },
  ],
  membership: {
    priceInr: 50,
    badgeText: "ONE-TIME ₹50 ENROLLMENT FEE • LIFETIME ACCESS",
    title: "Join the Focused Study Community",
    description:
      "The one-time ₹50 enrollment fee helps us maintain a focused and responsible study community. It is intended to encourage serious aspirants, discourage inactive or casual participation, and create a sense of responsibility toward regular study.",
    payeeName: "Study Room",
    benefits: [
      "Encourages serious aspirants & discourages casual or inactive participation",
      "Contributes directly to the maintenance and operation of the StudyRoom platform",
      "24/7 unlimited access to the live synchronized virtual study room",
      "Server-authoritative study chronometer with break tracking",
      "Intelligent Rivalry Arena proximity matching (Duel & Tri-Clash)",
      "Rolling 20-hour goal tracking and weekly Achiever leaderboard",
      "Pure focus: Zero cameras, zero audio, zero social media distraction",
    ],
    whyFeeTitle: "Why is there a ₹50 fee?",
    whyFeePoints: [
      "Encourages serious aspirants and discourages inactive or casual participation.",
      "Creates a sense of responsibility toward regular study.",
      "Contributes toward the maintenance and operation of the StudyRoom platform.",
      "Important: The ₹50 fee is one-time and non-refundable.",
    ],
    strictPolicyTitle: "Strict Community Policy",
    strictPolicyText:
      "Spamming, misuse of the platform, cheating, disruptive behavior, or other unfair activities may result in account suspension or termination without refund. Such action may be taken to protect the study environment and other members, and the decision will be subject to StudyRoom's applicable community rules.",
    steps: [
      {
        number: 1,
        title: "Scan the QR Code",
        description: "Open Google Pay, PhonePe, Paytm, or any UPI app and scan the payment QR code.",
      },
      {
        number: 2,
        title: "Pay ₹50",
        description: "Confirm the payee name 'Study Room' and complete the ₹50 one-time payment.",
      },
      {
        number: 3,
        title: "Submit Transaction UTR",
        description: "Click 'I Have Paid — Submit UTR' and enter the 12-digit transaction reference number.",
      },
      {
        number: 4,
        title: "Register Your Account",
        description: "Click through to the Study Room signup page to register your student profile.",
      },
    ],
    securityNote:
      "Scanning the QR and submitting your UTR initiates a manual verification request. Important: The ₹50 fee is one-time and non-refundable.",
  },
  conditions: {
    eligibility: [
      "Open to all competitive exam aspirants (JEE, NEET, UPSC, GATE, CAT, CA), university students, and self-taught learners.",
      "Must have a commitment to independent, disciplined study.",
      "One account per student; accounts cannot be shared or transferred.",
    ],
    acceptableUsage: [
      "The platform is dedicated solely to academic self-study and productivity.",
      "Strict Community Policy: Spamming, misuse of the platform, cheating, disruptive behavior, or unfair activities will result in account suspension or termination without refund.",
      "Timer usage must correspond to actual focused work. Artificial timer padding or bot scripts are strictly prohibited.",
      "Maintain the integrity of the Rivalry Arena and Leaderboard by logging honest sessions.",
      "Enforcement decisions are subject to StudyRoom's applicable community rules to safeguard all members.",
    ],
    studyRoomRules: [
      "Zero Distraction Policy: No voice calls, no video streaming, and no open chat channels.",
      "Use the Break Timer: If you step away from your desk, switch your status to Break or stop your session.",
      "Activity Standard: Regular participation is expected. Extended periods of dormancy (over 5 days) trigger check-in alerts.",
    ],
    paymentConditions: [
      "The ₹50 registration fee is a one-time enrollment payment for lifetime group access.",
      "Payment must be made through authentic UPI channels using the official QR code.",
      "A valid transaction reference / UTR is required to match your payment with bank statements.",
      "Important: The ₹50 fee is strictly one-time and non-refundable.",
    ],
    refundPolicy:
      "The ₹50 enrollment fee is one-time and non-refundable. It helps maintain a focused and responsible study community, discourages casual participation, and contributes toward the continuous maintenance and operation of the StudyRoom platform. Accounts suspended or terminated under our Strict Community Policy are not eligible for refunds.",
    cancellationPolicy:
      "You are free to discontinue using the platform at any time. You can export your session history or request complete account erasure via your Settings dashboard.",
    dataPrivacy:
      "We strictly respect student privacy. We only store the data needed to power your study experience: display name, email, session durations, and goal logs. We never track your browsing, never record audio or video, and never sell personal data.",
  },
  faqs: [
    {
      question: "Why is there a ₹50 fee?",
      answer:
        "The one-time ₹50 enrollment fee helps us maintain a focused and responsible study community. It is intended to encourage serious aspirants, discourage inactive or casual participation, and create a sense of responsibility toward regular study. The fee also contributes toward the maintenance and operation of the StudyRoom platform. Important: The ₹50 fee is one-time and non-refundable.",
    },
    {
      question: "Is the ₹50 fee refundable?",
      answer:
        "No. The ₹50 fee is one-time and non-refundable. Because access to the private study room infrastructure and verified leaderboard rankings is provisioned upon enrollment, the nominal fee cannot be refunded under any circumstances.",
    },
    {
      question: "What is StudyRoom's Strict Community Policy?",
      answer:
        "Spamming, misuse of the platform, cheating, disruptive behavior, or other unfair activities may result in account suspension or termination without refund. Such action may be taken to protect the study environment and other members, and the decision will be subject to StudyRoom's applicable community rules.",
    },
    {
      question: "Can an account be suspended or terminated without refund?",
      answer:
        "Yes. To protect the study environment and dedicated members, any cheating (such as fake timer padding or bot scripts), platform misuse, spamming, or disruptive conduct will result in account suspension or termination without refund.",
    },
    {
      question: "How does the fee encourage serious aspirants and discourage casual participation?",
      answer:
        "Free study groups frequently fill up with inactive accounts, casual visitors, and distractions. A small one-time ₹50 commitment creates a psychological investment and personal responsibility, ensuring that everyone in the room is committed to genuine, focused preparation.",
    },
    {
      question: "How does the fee contribute toward platform maintenance and operations?",
      answer:
        "Operating a realtime synchronization engine with millisecond-accurate study clocks, multi-user presence, and live Rivalry Duels requires dedicated cloud servers, database synchronization, and ongoing technical maintenance. The nominal ₹50 fee directly funds these operational costs.",
    },
    {
      question: "Is this ₹50 payment a monthly subscription?",
      answer:
        "No. It is a single one-time payment of ₹50 for lifetime access to the Study Room group platform. There are no recurring monthly charges, no annual subscriptions, and no hidden fees.",
    },
    {
      question: "What makes Study Room different from Zoom or Discord study groups?",
      answer:
        "Most study servers rely on video calls or open chat rooms, which often create social anxiety, tech fatigue, and endless chatting. Study Room provides silent, ambient accountability: you see real people studying right now, track actual focused seconds, and compete in the Rivalry Arena without ever turning on a camera or talking.",
    },
    {
      question: "How does the Rivalry Arena work?",
      answer:
        "StudyRoom intelligently identifies students performing close to each other (via weekly study hours or leaderboard rank) and unlocks a live Duel or Tri-Clash. Your real study activity drives the competition — every minute updates your score and shifts the gap live.",
    },
    {
      question: "What happens after I pay ₹50 and submit my UTR?",
      answer:
        "After submitting your UTR reference, you will be directed straight to the Study Room signup page to create your student profile. Your payment reference is recorded in our verification queue for admin confirmation against the bank statement.",
    },
    {
      question: "Can I use Study Room on my Android phone or tablet?",
      answer:
        "Yes! Study Room is designed mobile-first as a Progressive Web App (PWA) and also has an official Native Android App with background notifications and a live notification chronometer.",
    },
    {
      question: "What if my Google Drive QR code doesn't load?",
      answer:
        "Our platform includes intelligent multi-endpoint fallback algorithms. If a network filter or privacy extension blocks Google Drive, you can use our generated fallback UPI QR code or pay directly to the verified payee details.",
    },
  ],
  lastUpdated: new Date().toISOString(),
  version: 1,
};

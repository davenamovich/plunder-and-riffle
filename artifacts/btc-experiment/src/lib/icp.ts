export interface RoleCopy {
  label: string;
  headline: string;
  subheadline: string;
  painPoints: string[];
  whyThisHelps: string;
  proof: string;
}

const ICP_MAP: Record<string, RoleCopy> = {
  "salon owner": {
    label: "Salon Owner",
    headline: "You're a Salon Owner.",
    subheadline: "Empty chairs cost you money every single day. Your competitors are about to have an agent working 24/7 to fill them.",
    painPoints: [
      "Empty appointment slots drain revenue with no way to recover them",
      "Social media takes hours you don't have — and still doesn't fill chairs",
      "Referrals are unpredictable and impossible to scale",
      "Paid ads are expensive and hard to track back to actual bookings",
    ],
    whyThisHelps: "Your free 24-hour trial puts you inside an AI agent that's already working — finding people who need exactly what you offer and routing them to your link. You don't have to understand crypto or Web3. Just let it run and watch what happens.",
    proof: "Most salon owners see their first traffic hit within the first few hours. The agent doesn't stop at 5pm.",
  },
  "realtor": {
    label: "Realtor",
    headline: "You're a Realtor.",
    subheadline: "Lead costs keep rising. The agents who figure this out early will dominate their markets. This is your window.",
    painPoints: [
      "Zillow and paid portals charge you for leads you've already earned",
      "Manual prospecting eats time that should go toward closing",
      "Your pipeline is only as good as your last referral",
      "Cold outreach has a ceiling — and it's exhausting",
    ],
    whyThisHelps: "During your free 24 hours, you're inside an automated system that's generating and routing leads without you lifting a finger. This is what the top agents will be using in 18 months. You can try it today — for free.",
    proof: "The experiment is already running. Real leads. Real clicks. Your spot in the rotator starts the moment you activate.",
  },
  "creator": {
    label: "Creator",
    headline: "You're a Creator.",
    subheadline: "Your income is tied to your output. The moment you stop posting, it stops. That's not a business — it's a job.",
    painPoints: [
      "Monetization depends entirely on algorithm favor that changes constantly",
      "Brand deals are inconsistent and hard to negotiate",
      "You're creating for platforms that own your audience",
      "One bad month can wipe out your momentum",
    ],
    whyThisHelps: "Plunder and Riffle gives you a link in an AI-driven rotator — traffic that doesn't depend on your posting frequency. Your free trial runs for 24 hours. No algorithm. No gatekeeping. Just the system working.",
    proof: "You built an audience. Now let an agent build the pipeline behind it.",
  },
  "freelancer": {
    label: "Freelancer",
    headline: "You're a Freelancer.",
    subheadline: "When you stop working, your income stops. An agent doesn't take days off.",
    painPoints: [
      "Revenue is tied directly to your billable hours",
      "Finding new clients takes time away from doing work",
      "Feast-or-famine cycles are exhausting and unpredictable",
      "Referrals feel out of your control",
    ],
    whyThisHelps: "Your free 24-hour trial adds you to an AI-powered traffic loop that keeps moving whether you're working or sleeping. Think of it as the passive layer you've never had.",
    proof: "This isn't a promise. The experiment is live. Your spot in the rotator is waiting.",
  },
  "student": {
    label: "Student",
    headline: "You're a Student.",
    subheadline: "You have the most valuable thing: time to get in early. Most people won't move until this is obvious.",
    painPoints: [
      "No capital, no connections, no leverage to start building income",
      "Side hustles trade time for money — and you're already maxed out",
      "By the time most opportunities are 'proven,' the upside is gone",
      "Building something feels impossible without a team or resources",
    ],
    whyThisHelps: "Plunder and Riffle is designed for people who want to be early. Your free 24 hours puts you in the system right now — before this becomes mainstream. You don't need capital. You need a link and 24 hours.",
    proof: "Everyone will have an agent. The ones who got in early will already have proof it works.",
  },
  "gym owner": {
    label: "Gym Owner",
    headline: "You're a Gym Owner.",
    subheadline: "Membership churn is your biggest enemy. An agent that works in the background can help change that.",
    painPoints: [
      "New member acquisition is expensive and inconsistent",
      "Social content takes time and rarely converts to memberships",
      "Seasonal drop-off is brutal with no automated re-engagement",
      "Competing with big box gyms on price alone is a losing game",
    ],
    whyThisHelps: "Your free spot in the rotator gives your gym exposure through an agent that's already generating traffic. You don't need to understand how it works on the back end — just claim your 24 hours and watch the traffic hit.",
    proof: "Your gym doesn't close at night. Neither does the agent.",
  },
  "insurance agent": {
    label: "Insurance Agent",
    headline: "You're an Insurance Agent.",
    subheadline: "Lead costs keep climbing. The agents who build alternative pipelines now will win the next decade.",
    painPoints: [
      "Paid lead vendors are expensive and often low quality",
      "Referral networks take years to build and seconds to lose",
      "Cold calling ROI keeps declining as people screen calls",
      "Growing a book of business is slow without a system behind you",
    ],
    whyThisHelps: "Your free 24-hour trial plugs you into a system that's already generating organic traffic. Think of it as a low-cost lead pipeline you can evaluate before you commit. No credit card. Just your email and a click.",
    proof: "The experiment is running right now. Real traffic. Real clicks. Your slot is open.",
  },
  "restaurant owner": {
    label: "Restaurant Owner",
    headline: "You're a Restaurant Owner.",
    subheadline: "Slow nights cost you margin. The system that fills tables for your competitors is almost here.",
    painPoints: [
      "Slow nights are unavoidable — and expensive when margins are thin",
      "Delivery apps take 30% off the top while owning your customer data",
      "Social media marketing rarely translates to actual foot traffic",
      "Loyalty programs are hard to run without dedicated staff",
    ],
    whyThisHelps: "Your free 24 hours in the rotator puts your link inside an active traffic system — no ads to manage, no platform fees. Just an agent routing attention your way while you run your kitchen.",
    proof: "You can't control the weather. You can control whether you're in the system.",
  },
  "non-profit": {
    label: "Non-Profit",
    headline: "You're with a Non-Profit.",
    subheadline: "Your mission deserves more reach than your budget allows. The system doesn't care about budget.",
    painPoints: [
      "Marketing budgets are the first cut when funds get tight",
      "Awareness campaigns require reach that small orgs can't afford",
      "Donor acquisition is expensive and competitive",
      "Impact is hard to prove without a trail of engaged attention",
    ],
    whyThisHelps: "Plunder and Riffle routes real traffic to your link — for free, for 24 hours, no donation required. Think of it as a proof-of-concept for what automated reach could do for your mission.",
    proof: "The agent doesn't discriminate by budget. Your 24 hours work the same as everyone else's.",
  },
  "dasher": {
    label: "Dasher",
    headline: "You're a Dasher.",
    subheadline: "Gig work trades your time directly for money. An agent is the first thing you've ever had that doesn't.",
    painPoints: [
      "Income stops the moment you stop driving",
      "High-earning zones require constant monitoring and positioning",
      "Platform rate changes are out of your control",
      "Building anything passive feels out of reach with gig income",
    ],
    whyThisHelps: "Your free 24 hours gives you a spot in a traffic rotator that runs whether you're driving or not. This is a new kind of leverage — and it starts with zero dollars.",
    proof: "The experiment is live. Your link. Your spot. Your 24 hours. Go.",
  },
  "business owner": {
    label: "Business Owner",
    headline: "You're a Business Owner.",
    subheadline: "You've built something real. Now put an agent to work growing it while you run the business.",
    painPoints: [
      "Lead generation consumes budget that should go toward operations",
      "Marketing ROI is hard to measure and even harder to scale",
      "Finding customers without a dedicated team is exhausting",
      "Competitors who automate first will have a serious advantage",
    ],
    whyThisHelps: "Your free 24-hour trial puts your link into an AI-powered traffic system that's already running. Think of it as one more team member — one that never sleeps and doesn't invoice you.",
    proof: "You already take calculated risks. This one costs you nothing but an email.",
  },
};

const DEFAULT_COPY: RoleCopy = {
  label: "Professional",
  headline: "You've got something to offer.",
  subheadline: "Everyone will have an agent working for them. The question is whether yours is working yet.",
  painPoints: [
    "Getting attention is harder and more expensive than ever",
    "The platforms that own your audience can change the rules overnight",
    "Manual outreach doesn't scale — and it takes time you don't have",
    "Competitors who automate first will win the next five years",
  ],
  whyThisHelps: "Your free 24 hours puts you inside an AI-powered system that's already generating traffic — no setup, no ads, no expertise required. Just claim your spot and let the experiment run.",
  proof: "The agent is live right now. Your free slot is one click away.",
};

export function normalizeRole(input: string): string {
  return input.trim().toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
}

export function getRoleCopy(input: string): RoleCopy {
  const normalized = normalizeRole(input);
  return ICP_MAP[normalized] ?? DEFAULT_COPY;
}

export function getRoleLabel(input: string): string {
  return getRoleCopy(input).label;
}

export const COMMON_ROLES = [
  "Business Owner",
  "Salon Owner",
  "Realtor",
  "Creator",
  "Freelancer",
  "Student",
  "Gym Owner",
  "Insurance Agent",
  "Restaurant Owner",
  "Non-profit",
  "Dasher",
];

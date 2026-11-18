// ─────────────────────────────────────────────────────────────────────────────
//  Resume content. Edit this file only; the City view, Text view and agent files read it.
//
//  Companies are listed oldest first; generated formats show them newest first.
//  `id` is the stable record id: agents use it, and the rendered city (render/) keys each
//  employer building and its hover region by it. Placement in the city is chosen for
//  composition, not by this order. `education` entries with `campus: true` get a campus
//  in the city the same way; others appear only in the Text and Agent views.
//  `highlights` are ordered strongest first: the hover preview shows the summary, and the
//  side drawer shows everything.
//  After editing, run `npm run build` to regenerate resume.md, resume.json, llms.txt
//  and the static text block in index.html (`npm run check` fails if they are stale).
// ─────────────────────────────────────────────────────────────────────────────

export const PROFILE = {
  name: 'Chris Swanson',
  title: 'Principal GenAI Security Architect',
  tagline: 'Security architect and engineer: systems thinking, AI security, and building teams that ship.',
  location: 'Mountain View, CA',
  summary:
    'Security architect and engineer with fifteen years across fintech, identity, media and data ' +
    'companies. I design and build security for distributed systems, cloud and code-defined ' +
    'infrastructure, and enterprise architecture, and I now lead security architecture for ' +
    'GenAI and agentic systems. I focus on delivering against critical roadmap milestones, and ' +
    'on mentoring junior and mid-career engineers.',
  skills: [
    'GenAI & agentic system security', 'Security architecture', 'Threat modeling',
    'Detection & response', 'Identity, Zero Trust & BeyondCorp', 'Cloud security (AWS, GCP)',
    'Infrastructure as code & GitOps', 'Compliance (FedRAMP, PCI, SOX, SOC 2)',
    'Go · Python · Terraform',
  ],
  strengths: ['Achiever', 'Focus', 'Individualization', 'Learner', 'Restorative'],
  links: [
    { label: 'Email', href: 'mailto:chris.swanson6@gmail.com' },
  ],
  education: [
    {
      id: 'norwich',
      campus: true,
      name: 'Norwich University',
      degree: 'B.S., Computer Security & Information Assurance',
      location: 'Northfield, VT',
      summary: 'The oldest private military college in the United States.',
    },
    {
      id: 'mission',
      name: 'Mission College',
      degree: 'Network administration (CCNA I & II); Linux system administration & automation',
      location: 'Santa Clara, CA',
    },
  ],
  certifications: [
    { name: 'OSCP (Offensive Security Certified Professional)', year: '2023' },
    { name: 'GIAC Certified Forensic Analyst (GCFA), SANS FOR508', year: '2016' },
    { name: 'Mandiant Malware Analysis, Black Hat', year: '2014' },
    { name: 'Mandiant Memory Forensics, Black Hat', year: '2014' },
  ],
};

/** Look of the rendered city. */
export const THEME = {
  titleColor: '#2b59c3',
};

export const COMPANIES = [
  {
    id: 'tivo',
    name: 'TiVo',
    role: 'Security Engineer',
    dates: '2011 – 2013',
    location: 'Alviso, CA',
    accent: '#2ec4b6',
    summary:
      'Member of a small information security team covering vulnerability remediation, patch ' +
      'management, detection and response, and controls inside and outside the PCI environment.',
    highlights: [
      'Built and deployed PKI for the production environment with the engineering team.',
      'Deployed and maintained Symantec Vontu DLP, with network and endpoint monitoring across sensitive environments.',
      'Configured and validated detection coverage (Snort, OSSEC) across environments to support PCI and SOX audits.',
      'Designed and deployed vulnerability management systems and a shared remediation process with system administrators.',
      'Reviewed, designed and implemented the single sign-on (SAML) provider.',
      'Deployed and supported PGP mail, and supported the data-center team with security hardware.',
    ],
    tags: ['Data security', 'PCI & SOX', 'Detection'],
  },
  {
    id: 'palantir',
    name: 'Palantir',
    role: 'Security Engineer',
    dates: '2013 – 2016',
    location: 'Palo Alto, CA',
    accent: '#5b6b7c',
    summary:
      'Security engineer on the internal team, a 3–5 person operations group: vulnerability ' +
      'management, detection and response, and firewalls, with 24/7 on-call shifts on a 30-minute SLA.',
    highlights: [
      'Designed and implemented application allow-listing and blocking of binaries, domains and IPs (Bit9 and Carbon Black), with one API to block indicators of compromise.',
      'Built logging pipelines and alert enrichment, and wrote detections with automated forensic-artifact collection.',
      'Automated vulnerability management across multiple networks, with ticketing and reporting with the systems team.',
      'Built a scanner that found new assets on the network, tracked their compliance over time, and ticketed out-of-compliance devices.',
      'Ran tabletop exercises and live drills with partner teams to find gaps in how investigations were conducted.',
      'Built cross-platform forensic collection tooling with a unified format to speed up gathering and parsing.',
      'Automated phishing triage to cut time to resolution, and ran threat hunts.',
      'Operated Juniper SRX and Cisco ASA firewalls, AnyConnect and IPsec tunnels.',
    ],
    tags: ['Detection & response', 'Automation', 'Endpoint controls'],
  },
  {
    id: 'twitch',
    name: 'Twitch',
    parent: 'Amazon',
    role: 'Security Engineer',
    dates: '2016 – 2019',
    location: 'San Francisco, CA',
    accent: '#9146ff',
    summary:
      'Twitch’s second security engineer: helped the Director of Security build the information ' +
      'security program, and was the liaison between Twitch and AWS Security.',
    highlights: [
      'Researched, built and put into production several BeyondCorp solutions, and achieved network segmentation within the existing network’s constraints.',
      'Automated ALB OIDC gateways end to end: self-healing, scheduled rotation, a self-patching golden AMI, scaled across availability zones and regions.',
      'Wrote Go tooling for self-service YubiKey registration and user-certificate management.',
      'Set security baselines for enterprise SaaS (Google Workspace, Atlassian, GitHub) and delivered SAML single sign-on with IT.',
      'Mapped and documented the internal network and applications, and ran post-acquisition security reviews.',
      'Built the security team’s golden-image process and its knowledge base.',
    ],
    tags: ['Program building', 'BeyondCorp', 'Hybrid cloud'],
  },
  {
    id: 'wework',
    name: 'WeWork',
    role: 'Senior Infrastructure Security Engineer',
    dates: '2019 – 2020',
    location: 'San Francisco, CA',
    accent: '#1d1d1f',
    summary:
      'Security partner to the Building Technology team, from early design through build, plus ' +
      'custom tooling for strong authentication, easier onboarding and enterprise security automation.',
    highlights: [
      'Security review and guidance for large projects, including customer badging and wireless authentication for members and guests.',
      'Evaluated BeyondCorp solutions, and built authentication and access servers as infrastructure as code.',
      'Wrote a Go SSH-config wrapper that removed manual setup steps and cut onboarding time.',
      'Built search tooling that mapped users and systems across Carbon Black, Cisco Umbrella, AirWatch and Jamf.',
      'Mentored teammates through red-team practice (Hack The Box, OverTheWire) and lunch-and-learns.',
    ],
    tags: ['Tooling', 'BeyondCorp', 'Mentorship'],
  },
  {
    id: 'marqeta',
    name: 'Marqeta',
    role: 'Information Security Detection and Response Engineer, Lead',
    dates: '2020 – 2021',
    location: 'Oakland, CA (remote)',
    accent: '#14b88a',
    summary:
      'Led logging, detection and response capabilities for investigations and incidents, and ' +
      'helped run engineering incidents with corporate, product and platform teams.',
    highlights: [
      'Wrote the incident management standards and aligned priority levels across all engineering and security teams.',
      'Delivered Marqeta’s detection and response capabilities, and co-wrote the incident response policy and procedures.',
      'Led vendor selection for SOAR and incident management tooling, and for phishing detection and automation.',
      'Built automation to discover unpatched and unmanaged endpoints, with runbooks for remediation.',
      'Introduced incident metrics that set up a path to the VERIS framework.',
      'Built logging pipeline components, and rebuilt the team’s documentation in one format.',
    ],
    tags: ['Detection & response', 'Incident management', 'Program building'],
  },
  {
    id: 'idme',
    name: 'ID.me',
    role: 'Senior Security Engineer, Lead',
    dates: '2021 – 2022',
    location: 'McLean, VA (remote)',
    accent: '#08833d',
    summary:
      'Led security engineering for enterprise networks and infrastructure, partnering with platform ' +
      'engineering on a network architecture redesign and building telemetry, automation and controls.',
    highlights: [
      'Helped achieve and maintain FedRAMP Moderate: gathered evidence, designed a FedRAMP-compliant SAML implementation, and wrote infrastructure as code to remediate on audit deadlines.',
      'Brought GitOps to the WAF and network firewalls, and built self-service Terraform for Akamai WAF with automated merge checks that cut errors by 90%.',
      'Increased AWS visibility with Security Hub, GuardDuty and CloudTrail, centralised into the SIEM.',
      'Trained the security operations team on Terraform, and moved GuardDuty management to GitOps.',
      'Reviewed the AWS-to-GCP migration plans for security and compliance.',
      'Led SOAR vendor selection, and moved the security team from reactive to preventive engineering.',
    ],
    tags: ['FedRAMP', 'GitOps', 'Team building'],
  },
  {
    id: 'chainalysis',
    name: 'Chainalysis',
    role: 'Senior Security Engineer (Security Engineering) / Senior Enterprise Security Engineer, Lead',
    dates: '2022 – 2024',
    location: 'New York, NY (remote)',
    accent: '#ff6b2c',
    summary:
      'Led enterprise security engineering for corporate systems, identity and endpoints, reporting ' +
      'to the Director of Security: hardening identities and systems, improving telemetry, and ' +
      'reducing time to detection.',
    highlights: [
      'Conceived and drove company-wide adoption of a hardened golden image, built and shipped through GitOps and CI/CD with pull-request contributions.',
      'Designed the enterprise security engineering program: a unified strategy for Device Trust, DLP, Zero Trust and BeyondCorp.',
      'Formed an IAM committee and wrote IAM design patterns that settled ownership and fixed recurring access problems.',
      'Hardened offboarding and least privilege with platform and IT engineering, with scripted access reviews and stronger audit trails.',
      'Reviewed Google Workspace, Okta, Atlassian, Tailscale and third-party apps against DoD IL4, SOC 2 and customer audits.',
      'Built a gamified patching system that aggregated metrics to drive patch compliance.',
    ],
    tags: ['Enterprise security', 'Identity', 'Zero Trust'],
  },
  {
    id: 'wellsfargo',
    name: 'Wells Fargo',
    role: 'Principal GenAI Security Architect',
    dates: '2026 – Present',
    location: 'Menlo Park, CA',
    accent: '#c8102e',
    summary:
      'Leading technical strategy, security governance and architectural hardening for enterprise ' +
      'AI/ML workloads, agentic systems and their tooling, and setting scalable patterns for secure AI adoption.',
    highlights: [
      'Designed and deployed infrastructure knowledge graphs with MCP servers and skill registries, so engineering teams can map dependencies across services and processes.',
      'Built agent-driven security review pipelines that scale threat modeling for fast-moving AI/ML deployments.',
      'Set architecture patterns and security baselines for GenAI use cases, multi-agent coordination and high-risk data boundaries.',
      'Enabled secure AI runtimes and orchestration, with central lifecycle management for agent skills and tool definitions.',
      'Runs training, workshops and office hours that upskill engineering and security teams on AI and secure design.',
    ],
    tags: ['AI architecture', 'Knowledge graphs', 'AI threat modeling'],
  },
];

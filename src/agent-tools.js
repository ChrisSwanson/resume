// Agent tool definitions: one list shared by WebMCP registration (src/webmcp.js),
// the Agent view, and llms.txt (scripts/build.mjs). Content tools are pure; UI tools
// need `ui` hooks from the running page and are skipped when there is none.
import { toMarkdown, toJSON, profileMarkdown, companyMarkdown, listExperience, findCompany } from './format.js';

const companyInput = (companies) => ({
  type: 'object',
  properties: {
    company: {
      type: 'string',
      description: 'Experience id (from list_experience) or company name, e.g. ' + companies.slice(-2).map((c) => `"${c.name}"`).join(' or '),
    },
  },
  required: ['company'],
});

/**
 * @param {{profile: object, companies: object[]}} content
 * @param {{setView?: (v: string) => void, showCompany?: (index: number) => void} | null} ui
 */
export function agentTools({ profile, companies }, ui = null) {
  const notFound = (q) =>
    `No company matches "${q}". Known companies: ${companies.map((c) => c.name).join(', ')}.`;

  const tools = [
    {
      name: 'get_profile',
      description: `Name, title, summary, skills and contact links for ${profile.name}.`,
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      execute: async () =>
        profileMarkdown(profile) + (profile.skills?.length ? `\nSkills: ${profile.skills.join(', ')}\n` : ''),
    },
    {
      name: 'list_experience',
      description: 'Every role held, most recent first, as "Company: Role (dates) [id: …]" lines. Use the id with get_experience.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      execute: async () => listExperience(companies),
    },
    {
      name: 'get_experience',
      description: 'Full details (role, dates, summary, highlights, tags) for one company.',
      inputSchema: companyInput(companies),
      annotations: { readOnlyHint: true },
      execute: async ({ company } = {}) => {
        const c = findCompany(companies, company);
        return c ? companyMarkdown(c, 2) : notFound(company);
      },
    },
    {
      name: 'get_resume',
      description: 'The whole resume, as markdown (default) or JSON.',
      inputSchema: {
        type: 'object',
        properties: { format: { type: 'string', enum: ['markdown', 'json'], description: 'Output format.' } },
      },
      annotations: { readOnlyHint: true },
      execute: async ({ format = 'markdown' } = {}) =>
        format === 'json' ? JSON.stringify(toJSON(profile, companies), null, 2) : toMarkdown(profile, companies),
    },
  ];

  if (ui) {
    tools.push(
      {
        name: 'set_view',
        description: 'Switch the page between the 3D valley, the plain text resume, and the agent view.',
        inputSchema: {
          type: 'object',
          properties: { view: { type: 'string', enum: ['3d', 'text', 'agent'] } },
          required: ['view'],
        },
        execute: async ({ view } = {}) => {
          if (!['3d', 'text', 'agent'].includes(view)) return 'view must be one of: 3d, text, agent';
          await ui.setView(view);
          return `Switched to the ${view} view.`;
        },
      },
      {
        name: 'show_company',
        description: "Show one company to the person viewing the page: opens its card in 3D or scrolls to it in text.",
        inputSchema: companyInput(companies),
        execute: async ({ company } = {}) => {
          const c = findCompany(companies, company);
          if (!c) return notFound(company);
          ui.showCompany(companies.indexOf(c));
          return `Showing ${c.name}.`;
        },
      },
    );
  }
  return tools;
}

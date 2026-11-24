# AgentLemon Academy

The Academy is a beginner course for people who use ChatGPT or Claude in a browser or on a phone. Assume they’ve never heard of an agent, a skill, or a connector. Use everyday words, short sentences, and one action at a time.

The page at `/academy` shows **AI made simple.** as its headline, with **AgentLemon Academy** above it. The promise is to connect AgentLemon to the AI the learner already uses in about 10 minutes, so they can stop copying and pasting between apps, learn what an agent and a skill are, and make one of each.

| Step ID      | Lesson                        | Minutes |
| ------------ | ----------------------------- | ------: |
| `what`       | Meet AgentLemon               |       1 |
| `connect`    | Connect AgentLemon to your AI |       3 |
| `agent`      | Try an agent                  |       2 |
| `skill`      | Try a skill                   |       2 |
| `make-skill` | Make your first skill         |       2 |
| `make-agent` | Make your first agent         |       2 |
| `next`       | Keep going                    |       1 |

Edit the tagline, promise, lessons, and tutor prompt in [`src/lib/academy.ts`](../src/lib/academy.ts). The page that renders them is `src/pages/AcademyPage.tsx`. Keep the exports and step IDs stable. The browser uses the IDs to remember progress.

Keep any connector links in the lessons and tutor prompt on `ACADEMY_CONNECTOR_URL` so learners can save items to their accounts. If setup menus change, check the [Claude help](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp) and [ChatGPT help](https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt) before updating the steps. Run `npm test` to check the course time, step IDs, learner copy, and tutor tool names.

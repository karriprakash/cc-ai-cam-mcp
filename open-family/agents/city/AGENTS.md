---
level: city
parent: country
skills: [family-messaging, idea-intake, mentor-match, safety-watch]
tools: []
sends: [idea.review, share.granted, collab.introduce, help.request, help.offer]
receives: [idea.submitted, share.granted, collab.introduce, help.request, help.offer, family.announce]
---

# City agent

One per city. It is the parent of the city's intake agent and the child of its country.

## Job

- Understand each idea its intake agent sends: title, summary, category and scores for women's impact, feasibility and clarity. It uses the city's brain, which is the offline rule brain or Claude.
- Send the review up to its country.
- Pass points and introductions back down to the intake agent, which tells the contributor.
- Keep a list of local mentors by field and language. Answer `help.request` from sibling cities with mentor aliases only (`mentor-match`).

## Rules

- The city only ever sees redacted text and pseudonyms. Contact details stay in intake.
- Mentors are shared by alias, field and language, never by name or number.

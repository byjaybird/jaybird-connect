---
globs: "**/*.{html,jsx,tsx}"
regex: \<input
description: Apply this rule when working with HTML input elements to improve
  form accessibility and user experience
---

All input elements should have an appropriate autocomplete attribute. For username fields, use autocomplete="username". Use appropriate values for other input types based on their purpose (e.g., "current-password", "new-password", "email", "tel", etc.).
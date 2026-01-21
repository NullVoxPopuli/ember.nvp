import * as p from "@clack/prompts";

export async function askName() {
  const projectName = await p.text({
    message: "What is your project name?",
    placeholder: "my-app",
    defaultValue: 'my-app',
    validate(value) {
      if (value.length === 0) return "Project name is required";
      if (!/^[a-z0-9-]+$/.test(value)) {
        return "Project name must be lowercase and can only contain letters, numbers, and hyphens";
      }
    },
  });

  if (p.isCancel(projectName)) {
    p.cancel("Operation cancelled");
    return process.exit(0);
  }

  return projectName;
}

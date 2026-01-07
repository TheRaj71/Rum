# Contributing to rum

Thank you for your interest in contributing to rum! This project is a personal endeavor and is currently unstable, but contributions are welcome and greatly appreciated. Whether you're fixing bugs, adding features, improving documentation, or reporting issues, your help can make a big difference.

## Ways to Contribute

There are many ways to contribute to rum:

- **Code Contributions**: Submit pull requests with bug fixes, new features, or improvements.
- **Documentation**: Help improve the README, add examples, or write tutorials.
- **Issue Reporting**: Report bugs, suggest features, or ask questions.
- **Testing**: Test the CLI in different environments and report issues.
- **Feedback**: Share your experience using rum and suggest improvements.

## Prerequisites

Before contributing, ensure you have:

- Node.js (version 18 or higher)
- pnpm (recommended package manager)
- Basic knowledge of Svelte, TypeScript, and CLI tools
- A GitHub account

## Getting Started

1. **Fork the Repository**: Click the "Fork" button on the GitHub repository page.
2. **Clone Your Fork**: 
   ```bash
   git clone https://github.com/your-username/Rum.git
   cd Rum
   ```
3. **Install Dependencies**:
   ```bash
   pnpm install
   ```
4. **Set Up Development Environment**:
   - Build the CLI: `pnpm build`
   - Run tests: `pnpm test`
   - Start development mode: `pnpm dev`

## Development Workflow

### Branching

- Create a new branch for your changes: `git checkout -b feature/your-feature-name` or `git checkout -b fix/issue-number`.
- Use descriptive branch names.

### Making Changes

- Write clear, concise commit messages.
- Follow the existing code style (use Prettier for formatting).
- Add tests for new features or bug fixes.
- Update documentation if necessary.

### Pull Requests

1. Push your branch to your fork: `git push origin your-branch-name`
2. Create a Pull Request (PR) on GitHub.
3. Fill out the PR template with:
   - A clear title and description
   - Reference any related issues
   - Screenshots or videos demonstrating the changes (if applicable)
   - Test results

PRs will be reviewed, and you may be asked for changes. Be patient and responsive!

## Reporting Issues

Issues are a great way to contribute. When creating an issue:

- Use the appropriate template (Bug Report, Feature Request, or Question).
- Provide as much detail as possible.
- Include labels: e.g., `bug`, `enhancement`, `question`, `documentation`.

### Bug Reports

For bugs, include:

- **Expected Behavior**: What you expected to happen.
- **Actual Behavior**: What actually happened (how it's wrong).
- **Steps to Reproduce**: Detailed steps to trigger the bug.
- **Environment**: OS, Node.js version, pnpm version, etc.
- **Screenshots/Videos**: Visual evidence is appreciated! Preview links or embedded media help a lot.
- **Additional Context**: Any other relevant information.

Example:
- Expected: The `rum add button` command should add the button component without errors.
- Actual: It throws an error "Module not found".

### Feature Requests

- Describe the feature clearly.
- Explain why it's needed and how it benefits users.
- Include mockups, screenshots, or videos if possible.

### Questions

- Be specific and provide context.
- Check existing issues and documentation first.

## Code Style

- Use TypeScript for type safety.
- Follow ESLint and Prettier configurations.
- Write descriptive variable and function names.
- Comment complex logic.

## Testing

- Run the test suite: `pnpm test`
- Add unit tests for new code.
- Test manually in a SvelteKit project.
- Ensure no regressions.

## Communication

- Be respectful and constructive in discussions.
- Use GitHub issues and PRs for technical discussions.
- Follow the Code of Conduct.

## Recognition

Contributors will be acknowledged in the project. Your name may appear in release notes or the README.

Thank you for contributing to rum! 🍹
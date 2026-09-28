Each base is a _real_ project.
You can run it from its `files/` directory.

A base never uses a template language such as ejs:
that would make the base unrunnable.

To change the project name, the base's `index.js` finds every place the name is used,
and swaps it out (codemod style).

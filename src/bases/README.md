Each of these base projects are _real_ projects that can be ran in these directories.

For changing the name of a project, the code in the base layer's index.js should find all the places the name is used and swap it out (codemod style).

We don't want to use ejs, because it makes the base layers unrunnable.

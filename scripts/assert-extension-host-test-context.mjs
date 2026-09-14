if (process.env.AALTO_DISPATCHER_CODEX_SANDBOX === "1") {
  console.error(
    "Refusing npm test inside the dispatcher Codex sandbox. " +
      "The dispatcher runs the Electron suite host-side after the turn.",
  );
  process.exit(78);
}

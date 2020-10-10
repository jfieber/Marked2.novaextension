nova.commands.register("marked.runMarked2", (editor) => {

  var process = new Process("/usr/bin/open", {
    args: ["-a", "Marked 2", editor.document.path],
  });

  var lines = [];
  process.onStderr(function (data) {
    if (data) {
      lines.push(data);
    }
  });

  process.onDidExit(function (status) {
    if (status != 0) {
      nova.workspace.showInformativeMessage(
        nova.localize("Error Launching Marked 2:") + "\n\n" + lines.join("")
      );
    }
  });

  process.start();
});

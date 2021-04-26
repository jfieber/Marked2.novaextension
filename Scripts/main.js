const markedPathPref = "org.ursamaris.nova.marked2.markedPath";

// Verify the path to Marked 2.
resolveMarkedPath();

nova.commands.register("marked.runMarked2", (editor) => {
  resolveMarkedPath()
    .then((markedPath) => {
      return novaExec("/usr/bin/open", {
        args: ["-a", markedPath, editor.document.path],
      });
    })
    .catch((err) => {
      console.log("TOP", JSON.stringify(err));
      if (typeof err === "string") {
        nova.workspace.showInformativeMessage(err);
      } else {
        nova.workspace.showInformativeMessage(
          nova.localize("Error Launching Marked 2") +
            ":\n\n" +
            execErrorMessage(err)
        );
      }
    });
});

var streaming = null;
nova.commands.register("marked.streamMarked2", (editor) => {
  if (streaming !== null && Disposable.isDisposable(streaming)) {
    console.info("Streaming preview OFF");
    streaming.dispose();
    streaming = null;
  } else {
    console.info("Streaming preview ON");
    liveRefresh(editor);
    streaming = editor.onDidStopChanging((editor) => {
      liveRefresh(editor);
    });
  }
});

function liveRefresh(editor) {
  var options = {
    args: ["-a", "Nova.app"],
    stdio: "pipe",
  };

  const docPath = editor.document.path;
  if (docPath != undefined && docPath != null) {
    options.args = options.args.concat("-p", docPath);
  }

  var mkstream = new Process(
    nova.path.join(nova.extension.path, "bin", "mkstream"),
    options
  );

  mkstream.onStdout((l) => {
    console.log(`mkstream stdout: ${l.trim()}`);
  });
  mkstream.onStderr((l) => {
    console.log(`mkstream stderr: ${l.trim()}`);
  });
  mkstream.onDidExit((status) => {
    if (status != 0) {
      console.log(`mkstream exit: ${status}`);
    }
  });

  mkstream.start();

  const txt = editor.document.getTextInRange(
    new Range(0, editor.document.length)
  );
  const writer = mkstream.stdin.getWriter();
  writer
    .write(txt)
    .then(() => {
      writer.close();
    })
    .catch(() => {
      console.log("failed to update Marked");
    });
}

//
// Work out the path to Marked 2.
//
function resolveMarkedPath() {
  return new Promise((resolve, reject) => {
    // If the existing config for the path seems good, go with it.
    let mk2 = nova.config.get(markedPathPref, "string");
    mk2stat = nova.fs.stat(mk2);
    if (mk2stat !== null && mk2stat !== undefined && mk2stat.isDirectory()) {
      return resolve(mk2);
    }

    // No? Then scoop up anything with a marked bundle ID and then
    // sort through the results to pick a default.
    applist("com.brettterpstra.marked*")
      .then((paths) => {
        prlist = paths.map((path) => {
          return mdls(path, [
            "kMDItemVersion",
            "kMDItemAppStoreIsAppleSigned",
            "kMDItemCFBundleIdentifier",
          ]);
        });

        Promise.allSettled(prlist).then((results) => {
          found = [];
          results.forEach((r) => {
            if (r.status === "fulfilled") {
              found.push(r.value);
            } else {
              console.error("mdls error:", execErrorMessage(r.reason));
            }
          });

          if (found.length === 0) {
            reject(
              nova.localize(
                "Unable to find the Marked 2 application. Please set the Marked app you wish to use in the Extension Preferences."
              )
            );
          } else {
            sorted = found.sort(bestMarked);
            console.info(`Marked 2 discovery found: ${JSON.stringify(sorted)}`);
            nova.config.set(markedPathPref, sorted[0].path);
            resolve(sorted[0].path);
          }
        });
      })
      .catch(reject);
  });
}

//
// Rank multiple versions of Marked. Use with Array.sort()
//
function bestMarked(a, b) {
  // Different versions? Newest wins.
  vrank = vsort(a.kMDItemVersion, b.kMDItemVersion);
  if (vrank != 0) {
    return vrank;
  }

  // Same version? Check bundle ID, Setapp wins.
  if (a.kMDItemCFBundleIdentifier !== b.kMDItemCFBundleIdentifier) {
    if (a.kMDItemCFBundleIdentifier === "com.brettterpstra.marked-setapp") {
      return 1;
    }
    return -1;
  }

  // Same bundle ID? Check app store vs non-app store. Non-app store wins.
  if (a.kMDItemAppStoreIsAppleSigned !== b.kMDItemAppStoreIsAppleSigned) {
    if (a.kMDItemAppStoreIsAppleSigned === "1") {
      return 1;
    }
    return -1;
  }

  // Must be the same
  return 0;
}

//
// Simplistic major.minor.patch version sort.
// Just pad each component with zeros and do string sort.
//
function vsort(a, b) {
  let padded = (s) => {
    let bits = s.trim().replace(/^[vV]/, "").split(".");
    while (bits.length < 3) {
      bits.push("0");
    }
    return bits.map((c) => c.padStart(4, "0")).join(".");
  };
  let pa = padded(a);
  let pb = padded(b);
  if (pa < pb) {
    return -1;
  }
  if (pa > pb) {
    return 1;
  }
  return 0;
}

//
// Lookup applications by bundle identifier. Wildcards
// can be used. Resolves to an array of paths to app bundles.
// A reject from novaExec is passed through unchanged.
//
function applist(bundleId) {
  return new Promise((resolve, reject) => {
    novaExec("/usr/bin/mdfind", {
      args: ["kMDItemCFBundleIdentifier", "=", bundleId],
    })
      .then((v) => {
        resolve(v.stdout);
      })
      .catch(reject);
  });
}

//
// Use mdls to retrieve the named metadata properties.
// Returns a Promise that resolves to an object looking like:
//
// {
//   path: string,
//   property1: string,
//   property2: string,
//   propertyn: string
// }
//
// A reject from novaExec is passed through unchanged.
//
function mdls(path, properties) {
  return new Promise((resolve, reject) => {
    novaExec("/usr/bin/mdls", {
      args: properties
        .map((p) => ["-name", p])
        .concat([path])
        .flat(),
    })
      .then((v) => {
        let pmap = {
          path: path,
        };
        v.stdout.forEach((row) => {
          kv = row.split(/\s+= /);
          pmap[kv[0]] = kv[1].replace(/^"/, "").replace(/"$/, "");
        });
        resolve(pmap);
      })
      .catch(reject);
  });
}

//
// Execute a command, with options as per the Nova Process API
// and return an promise resolving/rejecting to an object:
//
// {
//   status: number,
//   stdout: string[],
//   stderr: string[]
// }
//
function novaExec(command, options) {
  return new Promise((resolve, reject) => {
    let retVal = {
      status: 0,
      stdout: [],
      stderr: [],
    };
    let cmd = new Process(command, options || {});
    cmd.onStdout((l) => {
      retVal.stdout.push(l.trim());
    });
    cmd.onStderr((l) => {
      retVal.stderr.push(l.trim());
    });
    cmd.onDidExit((status) => {
      retVal.status = status;
      if (status === 0) {
        resolve(retVal);
      } else {
        reject(retVal);
      }
    });
    try {
      cmd.start();
    } catch (e) {
      retVal.status = 128;
      retVal.stderr = [e.message];
      reject(retVal);
    }
  });
}

function execErrorMessage(execReturn) {
  return (execReturn.stderr.length > 0
    ? execReturn.stderr
    : execReturn.stdout
  ).join("\n");
}

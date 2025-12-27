const markedPathPref = "org.ursamaris.nova.marked2.markedPath";
const markedBundleID = "com.brettterpstra.marked*";
const markedBundleIDSetapp = "com.brettterpstra.marked-setapp";

let State = {
  trash: new CompositeDisposable(),
  markedPath: null
};

exports.activate = function() {
  State.trash.add(nova.commands.register("marked.runMarked", commandRunMarked));
  State.trash.add(nova.config.onDidChange(markedPathPref, configPathChanged));
};

exports.deactivate = function() {
  State.trash.dispose();
};

// Open In Marked editor command
function commandRunMarked(editor) {
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
          nova.localize("Error Launching Marked") +
            ":\n\n" +
            execErrorMessage(err)
        );
      }
    });
}

// Reset the saved path to marked on config change.
function configPathChanged(a, b) {
  if (a != b) {
    if (State.markedPath !== null) {
      State.markedPath = null;
    }
  }
}

// Check the specified path to Marked is valid.
// Returns the path if valid or null if not.
function validateMarkedPath(markedPath) {
  if (markedPath !== null) {
    mkStat = nova.fs.stat(markedPath);
    if (mkStat !== null && mkStat !== undefined && mkStat.isDirectory()) {
      return markedPath;
    }
  }
  return null;
}


//
// Work out the path to Marked.
//
function resolveMarkedPath() {
  return new Promise((resolve, reject) => {
    // If the existing config for the path seems good, go with it.
    let configPath = nova.config.get(markedPathPref, "string");
    if (validateMarkedPath(configPath) !== null) {
      State.markedPath = configPath;
      console.info(`using preference specified Marked path: ${State.markedPath}`);
      return resolve(State.markedPath);
    } else {
      if (configPath !== null) {
        // If the existing config value is invalid, reset it and notify the user
        nova.config.remove(markedPathPref);
        timedNotification(
          nova.localize("Marked path is invalid"),
          nova.localize("The Marked Path extension setting is invalid. Resetting to default."),
          3000
        );
      }
    }

    // Have we found the path previously?
    State.markedPath = validateMarkedPath(State.markedPath)
    if (State.markedPath !== null) {
      console.info(`using previously discovered Marked path: ${State.markedPath}`)
      return resolve(State.markedPath);
    }

    // No? Then scoop up anything with a marked bundle ID and then
    // sort through the results to pick a default.
    applist(markedBundleID)
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
                "Unable to find the Marked application. Please set the Marked app you wish to use in the Extension Preferences."
              )
            );
          } else {
            sorted = found.sort(bestMarked).reverse();
            console.info(`Marked discovery found: ${JSON.stringify(sorted)}`);
            State.markedPath = sorted[0].path
            return resolve(State.markedPath);
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
    if (a.kMDItemCFBundleIdentifier === markedBundleIDSetapp) {
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

// Show a self-canceling notification for a specified duration
function timedNotification(title, body, timeout) {
  let req = new NotificationRequest();
  req.title = title;
  req.body = body;
  nova.notifications.add(req);
  setTimeout(() => { nova.notifications.cancel(req.identifier)}, timeout);
}

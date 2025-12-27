## Version 1.0

Initial release

## Version 1.0.1

Correct readme after updating icon with assets from Brett Terpstra.

## Version 1.0.2

Correct repository and bug links.

## Version 1.0.3

Add a preferences item to set the path to the Marked 2 application. If the preference is unset, or has an invalid path, the extension will query for applications with Marked 2 bundle identifiers and set the value.

## Version 1.1.0

Icon update

## Version 1.1.1

Fix a first-run bug where path to Marked is unset.

## Version 1.2.0

Support for Marked 3.

Note: This version changes the behavior of the _Marked Path_ extension setting.  Previously if this was unset, the extension would look for the newest installed version of Marked and update the _Marked Path_ setting to that version. In this version, if _Marked Path_ is unset, the extension finds the newest installed version of Marked but leaves the _Marked Path_ setting unset. If you always want the newest installed version of Marked, clear the value of the _Marked Path_ setting.

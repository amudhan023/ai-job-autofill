// package.json is the single source of truth for the extension's version;
// src/manifest.json must mirror it exactly for a Chrome Web Store upload to
// reflect the intended release.
export function assertVersionSync(pkgVersion, manifestVersion) {
  if (pkgVersion !== manifestVersion) {
    throw new Error(
      `Version mismatch: package.json is ${pkgVersion} but src/manifest.json is ${manifestVersion}. ` +
        "Update src/manifest.json's version field to match before packaging.",
    );
  }
}

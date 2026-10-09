// Install-time package adjustments.
//
// @prisma/client lists the Prisma CLI (`prisma`) as an optional peer dependency. Because
// packages/db has the CLI as a dev dependency, pnpm links it to the client, and a production
// `pnpm deploy` then ships the CLI, its studio and TypeScript (about 230 MB) in every service
// image. The runtime client and the pg driver adapter never import the CLI, so the optional
// peer is dropped. Required peers of other packages are untouched.

function readPackage(pkg) {
  if (pkg.name === '@prisma/client') {
    for (const field of ['peerDependencies', 'peerDependenciesMeta']) {
      if (pkg[field]) {
        delete pkg[field].prisma;
        delete pkg[field].typescript;
      }
    }
  }
  return pkg;
}

module.exports = { hooks: { readPackage } };

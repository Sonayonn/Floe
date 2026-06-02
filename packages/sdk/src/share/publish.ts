/**
 * Publishes a generated per-vault share package and returns the artifacts
 * deploy_vault needs. Shells out to the Sui CLI (reliable path; the SDK
 * orchestrates a multi-step deploy and the curator has the CLI).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateShareModule, type ShareModuleOpts } from './template.ts';

export interface PublishedShare {
  sharePackageId: string;   // the published package address
  shareType: string;        // "<pkg>::share::SHARE"
  treasuryCapId: string;    // TreasuryCap<SHARE> object id (pass to deploy_vault)
  metadataCapId?: string;
  digest: string;
}

export interface PublishOpts extends ShareModuleOpts {
  gasBudget?: number;       // default 200_000_000
}

/**
 * Generate + build + publish a share module. Returns the TreasuryCap + share type.
 * NOTE: uses `sui client publish --json`; the active CLI env must be testnet.
 */
export function publishShareModule(opts: PublishOpts): PublishedShare {
  const gen = generateShareModule(opts);

  // 1. write the package to a temp dir
  const dir = mkdtempSync(join(tmpdir(), 'floe-share-'));
  mkdirSync(join(dir, 'sources'), { recursive: true });
  writeFileSync(join(dir, 'Move.toml'), gen.moveToml);
  writeFileSync(join(dir, 'sources', 'share.move'), gen.shareMove);

  // 2. publish (build is implicit in publish)
  const gas = opts.gasBudget ?? 200_000_000;
  const out = execFileSync(
    'sui',
    ['client', 'publish', '--gas-budget', String(gas), '--json', '--skip-dependency-verification'],
    { cwd: dir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );

  const res = JSON.parse(out);
  if (res.effects?.status?.status !== 'success') {
    throw new Error(`share publish failed: ${JSON.stringify(res.effects?.status)}`);
  }

  // 3. parse object changes
  const changes: any[] = res.objectChanges ?? [];
  const published = changes.find((c) => c.type === 'published');
  if (!published) throw new Error('no published package in objectChanges');
  const sharePackageId: string = published.packageId;
  const shareType = `${sharePackageId}::share::SHARE`;

  const treasury = changes.find(
    (c) => c.type === 'created' && typeof c.objectType === 'string' && c.objectType.includes('TreasuryCap') && c.objectType.includes('::share::SHARE'),
  );
  if (!treasury) throw new Error('no TreasuryCap<SHARE> in objectChanges');
  const metadata = changes.find(
    (c) => c.type === 'created' && typeof c.objectType === 'string' && c.objectType.includes('MetadataCap'),
  );

  return {
    sharePackageId,
    shareType,
    treasuryCapId: treasury.objectId,
    metadataCapId: metadata?.objectId,
    digest: res.digest,
  };
}

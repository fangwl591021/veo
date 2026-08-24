import { readFileSync, writeFileSync } from 'node:fs';

const collectionPath='src/card-collection.js';
let collection=readFileSync(collectionPath,'utf8');

const oldDuplicate=`  const previous=await db.prepare('SELECT status,created_at FROM card_import_fingerprints WHERE user_id=? AND fingerprint=? LIMIT 1').bind(userId,fingerprint).first();
  if(previous && previous.status!=='failed' && (previous.status!=='pending' || Date.parse(previous.created_at)>Date.now()-2*60*60*1000)){
    const error=new Error('這張名片圖片已上傳過，不能重複收藏或領點');error.code='duplicate_upload';throw error;
  }
  if(previous)await db.prepare('DELETE FROM card_import_fingerprints WHERE user_id=? AND fingerprint=?').bind(userId,fingerprint).run();
  const id = newId('card_import');
  const keys = files.map((_, index)=>\`\${purpose === 'personal' ? 'personal-card-imports' : 'card-collections'}/\${userId}/\${id}/\${index ? 'back' : 'front'}.webp\`);
  await db.prepare("INSERT INTO card_import_fingerprints (user_id,fingerprint,event_id,status) VALUES (?,?,?,'pending')").bind(userId,fingerprint,id).run();`;

const newDuplicate=`  const previous=await db.prepare('SELECT status,created_at,event_id FROM card_import_fingerprints WHERE user_id=? AND fingerprint=? LIMIT 1').bind(userId,fingerprint).first();
  const duplicateImage=Boolean(previous && previous.status!=='failed' && (previous.status!=='pending' || Date.parse(previous.created_at)>Date.now()-2*60*60*1000));
  // 同一張圖片允許重新 OCR／裁切／更新既有名片，但不得建立新的領點資格。
  // 新的 duplicate import 故意不綁 card_import_fingerprints；confirm 後 reward gate 會判定為 0 點。
  if(previous && !duplicateImage)await db.prepare('DELETE FROM card_import_fingerprints WHERE user_id=? AND fingerprint=?').bind(userId,fingerprint).run();
  const id = newId('card_import');
  const keys = files.map((_, index)=>\`\${purpose === 'personal' ? 'personal-card-imports' : 'card-collections'}/\${userId}/\${id}/\${index ? 'back' : 'front'}.webp\`);
  if(!duplicateImage)await db.prepare("INSERT INTO card_import_fingerprints (user_id,fingerprint,event_id,status) VALUES (?,?,?,'pending')").bind(userId,fingerprint,id).run();`;

if(!collection.includes(oldDuplicate)) throw new Error('duplicate upload block not found');
collection=collection.replace(oldDuplicate,newDuplicate);
collection=collection.replace(
  `    return { id, imageCount:files.length };`,
  `    return { id, imageCount:files.length, duplicateImage };`,
);
collection=collection.replace(
  `    await db.prepare('DELETE FROM card_import_fingerprints WHERE user_id=? AND fingerprint=?').bind(userId,fingerprint).run().catch(()=>null);`,
  `    if(!duplicateImage)await db.prepare('DELETE FROM card_import_fingerprints WHERE user_id=? AND fingerprint=?').bind(userId,fingerprint).run().catch(()=>null);`,
);
writeFileSync(collectionPath,collection);

const indexPath='src/index.js';
let index=readFileSync(indexPath,'utf8');
const oldReward=`      const reward = result.updated
        ? {status:"duplicate",points:0}
        : await queueAndFulfillCardCollectionReward(env,member.userId,result.card.id);
      return json({ success: true, ...result, reward }, result.updated ? 200 : 201);`;
const newReward=`      const rewardFingerprint=await env.DB.prepare('SELECT status FROM card_import_fingerprints WHERE event_id=? AND user_id=? LIMIT 1').bind(decodeURIComponent(confirmCardImport[1]),member.userId).first();
      const rewardEligible=!result.updated && rewardFingerprint?.status==='completed';
      const reward = rewardEligible
        ? await queueAndFulfillCardCollectionReward(env,member.userId,result.card.id)
        : {status:"duplicate",points:0};
      return json({ success: true, ...result, reward }, result.updated || !rewardEligible ? 200 : 201);`;
if(!index.includes(oldReward)) throw new Error('confirm reward block not found');
index=index.replace(oldReward,newReward);
writeFileSync(indexPath,index);

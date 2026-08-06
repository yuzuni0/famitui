import { readFileSync } from 'fs';
import { resolve } from 'path';
import { assertFails, assertSucceeds, initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, Timestamp } from 'firebase/firestore';

const PROJECT_ID = 'famitui-users-test';

const ALICE = 'alice-uid';
const BOB = 'bob-uid';

//createdTimeを事前に設定する
//setDocのテストにて同じ値を送信する
//createdTimeを保持する
const SEEDED_CREATED_TIME = Timestamp.fromDate(
  new Date('2026-01-01T00:00:00.000Z'));

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8'),
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

//Rules を無効化して前提となるドキュメントを作成する
async function seedUser(uid: string, displayName: string): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users', uid), {
      displayName,
      familyId: null,
      createdTime: SEEDED_CREATED_TIME,
    });
  });
}

//認証済みユーザーとしてuidの参照を行う
function userRef(authUid: string, targetUid: string) {
  return doc(testEnv.authenticatedContext(authUid).firestore(), 'users', targetUid);
}

//未認証ユーザーとしてuidの参照を行う
function unauthedUserRef(targetUid: string) {
  return doc(testEnv.unauthenticatedContext().firestore(), 'users', targetUid);
}

describe('firestore.rules: /users/{uid}', () => {
  describe('許可される操作', () => {

    it('自身のドキュメントを取得[get]できる', async () => {
      await seedUser(ALICE, 'アリス');

      await assertSucceeds(getDoc(userRef(ALICE, ALICE)));
    });

    it('displayName・familyId:null・createdTime:serverTimestamp() を持つ自身のドキュメントを作成できる', async () => {
      await assertSucceeds(
        setDoc(userRef(ALICE, ALICE), {
          displayName: 'アリス',
          familyId: null,
          createdTime: serverTimestamp(),
        })
      );
    });

    it('自身の displayName を更新できる', async () => {
      await seedUser(ALICE, 'アリス');

      await assertSucceeds(
        setDoc(
          userRef(ALICE, ALICE),
          { displayName: 'アリス改' },
          { merge: true }
        )
      );
    });
  });

  describe('拒否される操作', () => {
    //自身のuidのみ操作できる
    it('他人のドキュメントを取得[get]できない', async () => {
      await seedUser(BOB, 'ボブ');

      await assertFails(getDoc(userRef(ALICE, BOB)));
    });

    it('未ログイン状態でドキュメントを取得できない', async () => {
      await seedUser(ALICE, 'アリス');

      await assertFails(getDoc(unauthedUserRef(ALICE)));
    });

    it('他人の uid のドキュメントを生成できない', async () => {
      await assertFails(
        setDoc(userRef(ALICE, BOB), {
          displayName: 'ボブ',
          familyId: null,
          createdTime: serverTimestamp(),
        })
      );
    });

    it('作成時に familyId へ文字列を入れられない', async () => {
      await assertFails(
        setDoc(userRef(ALICE, ALICE), {
          displayName: 'アリス',
          familyId: 'family-1',
          createdTime: serverTimestamp(),
        })
      );
    });

    it('作成時に createdTime へ任意の日付を入れられない', async () => {
      await assertFails(
        setDoc(userRef(ALICE, ALICE), {
          displayName: 'アリス',
          familyId: null,
          createdTime: Timestamp.fromDate(new Date('2020-01-01T00:00:00.000Z')),
        })
      );
    });

    it('許可されていないフィールド(level)を含めて作成できない', async () => {
      await assertFails(
        setDoc(userRef(ALICE, ALICE), {
          displayName: 'アリス',
          familyId: null,
          createdTime: serverTimestamp(),
          level: 1,
        })
      );
    });

    it('familyId を更新できない', async () => {
      await seedUser(ALICE, 'アリス');

      await assertFails(
        setDoc(
          userRef(ALICE, ALICE),
          { familyId: 'family-1' },
          { merge: true }
        )
      );
    });

    it('displayName を削除できない', async () => {
      await seedUser(ALICE, 'アリス');

      await assertFails(
        setDoc(userRef(ALICE, ALICE), {
          familyId: null,
          createdTime: SEEDED_CREATED_TIME,
        })
      );
    });

    it('Firestore ドキュメントを削除できない', async () => {
      await seedUser(ALICE, 'アリス');

      await assertFails(deleteDoc(userRef(ALICE, ALICE)));
    });
  });
});
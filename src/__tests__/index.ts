import dots, { DotData, memoryPersister, diskPersister } from "../index";
import { unlink, readdir, stat, readFile } from "node:fs/promises";
import { join as pathJoin } from "node:path";

const ROOT_TEST_FOLDER = "/tmp/dots";
function testdb(n?: number) {
	if (!n) n = Math.floor(Math.random() * 100) + 1;
	return `${ROOT_TEST_FOLDER}/${n}`;
}

async function cleanup() {
	try {
		const dbs = await readdir(ROOT_TEST_FOLDER);
		for (let db of dbs) {
			db = pathJoin(ROOT_TEST_FOLDER, db);
			const s = await stat(db);
			if (s.isFile()) {
				console.log(`removing ${db}`);
				await unlink(db);
			}
		}
	} catch (_) {
		/* ignore */
	}
}

type TestRec = {
	id: number;
};

const memCfg = {
	saveEvery: 10,
	persister: memoryPersister<TestRec>(),
};

describe("setup", () => {
	it("throws exception if shut down", async () => {
		const dot = await dots.setup<TestRec>(testdb(), memCfg);
		dot.close();
		expect(() => dot.add({ id: 1 })).toThrow(`${dot.name} not set up`);
	});

	it("is ready when starting with empty data", async () => {
		let ready = false;
		const dot = await dots.setup<TestRec>(testdb(), memCfg);
		dot.q((_) => (ready = true));
		expect(ready).toBe(true);
	});

	it("throws exception if setup twice", async () => {
		const dot = await dots.setup(testdb(), memCfg);
		await expect(async () => {
			await dots.setup(dot.name, memCfg);
		}).rejects.toThrow(`${dot.name} already set up`);
	});

	it("is ready if closed in between", async () => {
		let ready = 0;
		let dot = await dots.setup(testdb(), memCfg);
		dot.q((_) => ready++);
		await dot.close();
		dot = await dots.setup(dot.name, memCfg);
		dot.q((_) => ready++);
		expect(ready).toBe(2);
	});

	it("to be ready and called with data when correctly set up", async () => {
		const ids: Array<number> = [];
		const dot = await dots.setup<TestRec>(testdb(), memCfg);
		dot.add({ id: 1 });
		dot.q((recs) => recs.forEach((r) => ids.push(r.id)));
		expect(ids).toStrictEqual([1]);
		let numrecs = 0;
		dot.q((recs) => (numrecs = recs.length));
		expect(numrecs).toBe(1);
	});
});

describe("saving", () => {
	it("saves after 1 second", async () => {
		let numsaved = 0;
		const dot = await dots.setup(testdb(), {
			saveEvery: 1,
			persister: memoryPersister<TestRec>(),
			optimizer: (dotdata: DotData<TestRec>) => (numsaved = dotdata.saved),
		});
		dot.add({ id: 1 });
		expect(numsaved).toBe(0);
		await new Promise((r) => setTimeout(r, 1500));
		dot.add({ id: 2 });
		expect(numsaved).toBe(1);
	});

	it("does not persist after closing when saving in memory", async () => {
		let numrecs = 0;
		let ids: Array<number> = [];
		let dot = await dots.setup(testdb(), {
			saveEvery: 1,
			persister: memoryPersister<TestRec>(),
		});
		dot.add({ id: 1 });
		dot.add({ id: 2 });
		dot.q((recs) => recs.forEach((r) => ids.push(r.id)));
		expect(ids).toStrictEqual([1, 2]);
		await dot.close();
		dot = await dots.setup(dot.name, {
			saveEvery: 1,
			persister: memoryPersister<TestRec>(),
		});
		dot.q((recs) => (numrecs = recs.length));
		expect(numrecs).toBe(0);
		dot.add({ id: 11 });
		ids = [];
		dot.q((recs) => recs.forEach((r) => ids.push(r.id)));
		expect(ids).toStrictEqual([11]);
	});

	it("persists after closing when saving to disk", async () => {
		await cleanup();
		let numrecs = 0;
		let ids: Array<number> = [];
		let dot = await dots.setup<TestRec>(testdb(), {
			saveEvery: 1,
			persister: diskPersister<TestRec>(),
		});
		dot.add({ id: 1 });
		dot.add({ id: 2 });
		dot.q((recs) => recs.forEach((r) => ids.push(r.id)));
		expect(ids).toStrictEqual([1, 2]);
		await dot.close();
		dot = await dots.setup<TestRec>(dot.name, {
			saveEvery: 1,
			persister: diskPersister<TestRec>(),
		});
		dot.q((recs) => (numrecs = recs.length));
		expect(numrecs).toBe(2);
		dot.add({ id: 11 });
		ids = [];
		dot.q((recs) => recs.forEach((r) => ids.push(r.id)));
		expect(ids).toStrictEqual([1, 2, 11]);
		await cleanup();
	});

	it("persists raw", async () => {
		await cleanup();
		let numrecs = 0;
		let ids: Array<string> = [];
		let dot = await dots.setup<string>(testdb(), {
			saveEvery: 1,
			persister: diskPersister({ raw: true }),
		});
		dot.add("one");
		dot.add("two");
		dot.q((recs) => recs.forEach((r) => ids.push(r)));
		expect(ids).toStrictEqual(["one", "two"]);
		await dot.close();
		dot = await dots.setup<string>(dot.name, {
			saveEvery: 1,
			persister: diskPersister({ raw: true }),
		});
		dot.q((recs) => (numrecs = recs.length));
		expect(numrecs).toBe(2);
		dot.add("three");
		ids = [];
		dot.q((recs) => recs.forEach((r) => ids.push(r)));
		expect(ids).toStrictEqual(["one", "two", "three"]);
		await dot.close();
		const data = await readFile(dot.name, "utf8");
		expect(data).toStrictEqual("one\ntwo\nthree\n");
		await cleanup();
	});
});

afterEach(() => {
	dots.shutdown();
});

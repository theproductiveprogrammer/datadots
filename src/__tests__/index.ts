import dots, { DotData, memoryPersister, diskPersister } from "../index";
import { unlink, stat, readFile } from "node:fs/promises";

type TestRec = {
	id: number;
};

const memCfg = {
	saveEvery: 10,
	persister: memoryPersister<TestRec>(),
};

describe("setup", () => {
	const dbname1 = "/tmp/dots/1.db";
	it("throws exception if shut down", async () => {
		const dot = await dots.setup<TestRec>(dbname1, memCfg);
		dot.close();
		expect(() => dot.add({ id: 1 })).toThrow(`${dot.name} not set up`);
	});

	it("is ready when starting with empty data", async () => {
		let ready = false;
		const dot = await dots.setup<TestRec>(dbname1, memCfg);
		dot.q((_) => (ready = true));
		expect(ready).toBe(true);
	});

	const dbname2 = "/tmp/dots/2.db";
	it("throws exception if setup twice", async () => {
		const dot = await dots.setup(dbname2, memCfg);
		await expect(async () => {
			await dots.setup(dbname2, memCfg);
		}).rejects.toThrow(`${dot.name} already set up`);
	});

	const dbname3 = "/tmp/dots/3.db";
	it("is ready if closed in between", async () => {
		let ready = 0;
		let dot = await dots.setup(dbname3, memCfg);
		dot.q((_) => ready++);
		await dot.close();
		dot = await dots.setup(dbname3, memCfg);
		dot.q((_) => ready++);
		expect(ready).toBe(2);
	});

	const dbname4 = "/tmp/dots/4.db";
	it("to be ready and called with data when correctly set up", async () => {
		const ids: Array<number> = [];
		const dot = await dots.setup<TestRec>(dbname4, memCfg);
		dot.add({ id: 1 });
		dot.q((recs) => recs.forEach((r) => ids.push(r.id)));
		expect(ids).toStrictEqual([1]);
		let numrecs = 0;
		dot.q((recs) => (numrecs = recs.length));
		expect(numrecs).toBe(1);
	});
});

describe("saving", () => {
	const dbname = "/tmp/dots/1.db";
	it("saves after 1 second", async () => {
		let numsaved = 0;
		const dot = await dots.setup(dbname, {
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
		let dot = await dots.setup(dbname, {
			saveEvery: 1,
			persister: memoryPersister<TestRec>(),
		});
		dot.add({ id: 1 });
		dot.add({ id: 2 });
		dot.q((recs) => recs.forEach((r) => ids.push(r.id)));
		expect(ids).toStrictEqual([1, 2]);
		await dot.close();
		dot = await dots.setup(dbname, {
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
		await cleanup(dbname);
		let numrecs = 0;
		let ids: Array<number> = [];
		let dot = await dots.setup<TestRec>(dbname, {
			saveEvery: 1,
			persister: diskPersister<TestRec>(),
		});
		dot.add({ id: 1 });
		dot.add({ id: 2 });
		dot.q((recs) => recs.forEach((r) => ids.push(r.id)));
		expect(ids).toStrictEqual([1, 2]);
		await dot.close();
		dot = await dots.setup<TestRec>(dbname, {
			saveEvery: 1,
			persister: diskPersister<TestRec>(),
		});
		dot.q((recs) => (numrecs = recs.length));
		expect(numrecs).toBe(2);
		dot.add({ id: 11 });
		ids = [];
		dot.q((recs) => recs.forEach((r) => ids.push(r.id)));
		expect(ids).toStrictEqual([1, 2, 11]);
		await cleanup(dbname);
	});

	it("persists raw", async () => {
		await cleanup(dbname);
		let numrecs = 0;
		let ids: Array<string> = [];
		let dot = await dots.setup<string>(dbname, {
			saveEvery: 1,
			persister: diskPersister({ raw: true }),
		});
		dot.add("one");
		dot.add("two");
		dot.q((recs) => recs.forEach((r) => ids.push(r)));
		expect(ids).toStrictEqual(["one", "two"]);
		await dot.close();
		dot = await dots.setup<string>(dbname, {
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
		const data = await readFile(dbname, "utf8");
		expect(data).toStrictEqual("one\ntwo\nthree\n");
		await cleanup(dbname);
	});
});
afterEach(() => {
	dots.shutdown();
});

async function cleanup(dbname: string) {
	try {
		const s = await stat(dbname);
		if (s.isFile()) unlink(dbname);
	} catch (_) {
		/* ignore */
	}
}

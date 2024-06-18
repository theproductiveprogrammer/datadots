import dots, { DotData, memoryPersister } from "../index";

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
	it("save after 1 second", async () => {
		let numsaved = 0;
		const dot = await dots.setup(dbname, {
			saveEvery: 1,
			persister: memoryPersister<TestRec>(),
			optimizer: (dotdata: DotData<TestRec>) => (numsaved = dotdata.saved),
		});
		dot.add({ id: 1 });
		expect(numsaved).toBe(0);
		await new Promise((r) => setTimeout(r, 1500));
		dot.add({ id: 1 });
		expect(numsaved).toBe(1);
	});
});
afterEach(() => {
	dots.shutdown();
});

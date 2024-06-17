import dots, {
	Config,
	recordFrom,
	memoryPersister,
	justCompress,
	DotData,
} from "../index";

function dotCfg(cfg?: any): Config {
	const saveEvery = cfg?.saveEvery || 10;
	const persister = cfg?.persister || memoryPersister();
	const processor = cfg?.processor || justCompress;
	return {
		saveEvery,
		persister,
		processor,
	};
}

describe("setup", () => {
	const dbname1 = "/tmp/dots/1.db";
	it("throws exception if not set up", () => {
		expect(() => dots.add(dbname1, recordFrom({ id: 1 }))).toThrow(
			`${dbname1} not setup`
		);
	});

	it("is ready when starting with empty data", () => {
		let ready = false;
		dots.setup(
			dbname1,
			dotCfg({
				processor: (_: DotData) => {
					ready = true;
				},
			})
		);
		expect(ready).toBe(true);
	});

	const dbname2 = "/tmp/dots/2.db";
	it("throws exception if set twice", () => {
		dots.setup(dbname2, dotCfg());
		expect(() => dots.setup(dbname2, dotCfg())).toThrow(
			`${dbname2} already set up`
		);
	});

	const dbname3 = "/tmp/dots/3.db";
	it("is ready if shutdown in between", () => {
		let ready = 0;
		dots.setup(
			dbname3,
			dotCfg({
				processor: (_: DotData) => {
					ready++;
				},
			})
		);
		dots.shutdown();
		dots.setup(
			dbname3,
			dotCfg({
				processor: (_: DotData) => {
					ready++;
				},
			})
		);
		expect(ready).toBe(2);
	});

	const dbname4 = "/tmp/dots/4.db";
	it("to be ready and called with data when correctly set up", () => {
		let called = 0;
		const ids: Array<string> = [];
		dots.setup(
			dbname4,
			dotCfg({
				processor: (dotdata: DotData) => {
					for (let i = dotdata.saved; i < dotdata.records.length; i++) {
						ids.push(dotdata.records[i][1]);
					}
					called++;
				},
			})
		);
		dots.add(dbname4, recordFrom({ id: 1 }));
		expect(called).toBe(2);
		expect(ids).toStrictEqual(["1"]);
		let numrecs = 0;
		dots.q(dbname4, (dotdata) => {
			numrecs = dotdata.records.length;
		});
		expect(numrecs).toBe(1);
	});
});

describe("saving", () => {
	const dbname = "/tmp/dots/1.db";
	it("save after 1 second", async () => {
		dots.setup(dbname, dotCfg({ saveEvery: 1 }));
		dots.add(dbname, recordFrom({ id: 1 }));
		let numsaved = 0;
		dots.q(dbname, (dotdata) => (numsaved = dotdata.saved));
		expect(numsaved).toBe(0);
		await new Promise((r) => setTimeout(r, 1500));
		dots.q(dbname, (dotdata) => (numsaved = dotdata.saved));
		expect(numsaved).toBe(1);
	});
});
afterEach(() => {
	dots.shutdown();
});

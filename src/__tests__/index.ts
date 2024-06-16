import dots from "../index";

function dotCfg(cfg?: any): dots.Config {
	const saveEvery = cfg?.saveEvery || 10;
	const persister = cfg?.persister || dots.memoryPersister;
	const processor = cfg?.processor || dots.justCompress;
	return {
		saveEvery,
		persister,
		processor,
	};
}

describe("setup", () => {
	const dbname1 = "/tmp/dots/1.db";
	it("throws exception if not set up", () => {
		expect(
			dots.add(
				dbname1,
				dots.recordFrom({
					id: 1,
				})
			)
		).toThrow(new Error(`${dbname1} not setup`));
	});

	it("is ready when starting with empty data", () => {
		let ready = false;
		dots.setup(
			dbname1,
			dotCfg({
				processor: (_: dots.DotData) => {
					ready = true;
				},
			})
		);
		expect(ready).toBe(true);
	});

	const dbname2 = "/tmp/dots/2.db";
	it("throws exception if set twice", () => {
		dots.setup(dbname2, dotCfg());
		expect(
			dots
				.setup(dbname2, dotCfg())
				.toThrow(new Error(`${dbname2} already set up`))
		);
	});

	const dbname3 = "/tmp/dots/3.db";
	it("to be ready and called with data when correctly set up", () => {
		let called = 0;
		const ids: Array<number> = [];
		dots.setup(
			dbname3,
			dotCfg({
				processor: (dotdata: dots.DotData) => {
					for (let i = dotdata.saved; i < dotdata.records.length; i++) {
						ids.push(dotdata.records[i][1]);
					}
					called++;
				},
			})
		);
		dots.add(
			dbname3,
			dots.recordFrom({
				id: 1,
			})
		);
		expect(called).toBe(2);
		expect(ids).toBe([1]);
	});
});

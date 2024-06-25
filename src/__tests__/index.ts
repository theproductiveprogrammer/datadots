import dots, { memoryPersister, DotData } from "../index";
import diskPersister from "../diskpersister";
import { rm, readFile, stat } from "node:fs/promises";
import AdmZip from "adm-zip";

const ROOT_TEST_FOLDER = "/tmp/dots";
function testdb(n?: number | string) {
	if (!n) n = Math.floor(Math.random() * 100) + 1;
	return `${ROOT_TEST_FOLDER}/${n}`;
}

async function cleanup() {
	try {
		await rm(ROOT_TEST_FOLDER, { recursive: true });
	} catch (err: any) {
		if (err.code === "ENOENT") {
			/* ignore */
		} else {
			throw err;
		}
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
		await dot.close();
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
	});

	it(
		"persists correctly after repeated save cycles",
		async () => {
			await cleanup();
			let numrecs = 0;
			let ids: Array<number> = [];
			let dot = await dots.setup<TestRec>(testdb(), {
				saveEvery: 1,
				persister: diskPersister<TestRec>(),
			});
			dot.add({ id: 1 });
			dot.q((recs) => (ids = recs.map((r) => r.id)));
			expect(ids).toStrictEqual([1]);
			await new Promise((r) => setTimeout(r, 1500));
			dot.add({ id: 2 });
			dot.q((recs) => (ids = recs.map((r) => r.id)));
			expect(ids).toStrictEqual([1, 2]);
			await new Promise((r) => setTimeout(r, 1500));
			dot.add({ id: 3 });
			dot.add({ id: 4 });
			await new Promise((r) => setTimeout(r, 1500));
			dot.q((recs) => (ids = recs.map((r) => r.id)));
			expect(ids).toStrictEqual([1, 2, 3, 4]);
			dot.add({ id: 5 });
			dot.q((recs) => (ids = recs.map((r) => r.id)));
			expect(ids).toStrictEqual([1, 2, 3, 4, 5]);
			await dot.close();
			dot = await dots.setup<TestRec>(dot.name, {
				saveEvery: 1,
				persister: diskPersister<TestRec>(),
			});
			dot.q((recs) => (numrecs = recs.length));
			expect(numrecs).toBe(5);
			dot.q((recs) => (ids = recs.map((r) => r.id)));
			expect(ids).toStrictEqual([1, 2, 3, 4, 5]);
		},
		10 * 1000
	);

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
		expect(data).toStrictEqual("one\ntwo\nthree");
	});
});

type ZFile = {
	name: string;
	data: string;
	lines: Array<string>;
};

async function testZFile(zfile: ZFile): Promise<void> {
	let dot = await load_dot_1();
	for (let i = 0; i < zfile.lines.length; i++) {
		const l = zfile.lines[i];

		if (Math.random() < 0.00001) {
			console.log(`re-opening ${zfile.name}`);
			await dot.close();
			dot = await load_dot_1();
		}

		if (Math.random() < 0.00005) {
			await new Promise((r) => setTimeout(r, 100));
		}

		dot.add(l);
	}

	if (Math.random() < 0.5) {
		await dot.close();
		dot = await load_dot_1();
	}

	dot.q((recs) => {
		for (let i = 0; i < zfile.lines.length; i++) {
			const r = recs[i];
			const z = zfile.lines[i];
			if (r !== z) {
				const msg = `
not matching: ${zfile.name} line: ${i + 1}
expected: ${z}
got: ${r}
`.trim();
				throw new Error(msg);
			}
		}
		expect(recs).toStrictEqual(zfile.lines);
	});

	await dot.close();

	async function load_dot_1() {
		return await dots.setup(testdb(zfile.name), {
			saveEvery: Math.floor(Math.random() * 5) + 1,
			persister: diskPersister(),
		});
	}
}

describe("load testing", () => {
	it(
		"can handle lots of files with of lines",
		async () => {
			await cleanup();
			const files = await loadTestFiles();
			const promises: Array<Promise<void>> = files.map(testZFile);
			for (let i = 0; i < promises.length; i++) {
				const p = promises[i];
				await p;
			}
		},
		30 * 60 * 1000
	);
});

const TEST_FILES = "test-files.zip";
async function loadTestFiles(): Promise<Array<ZFile>> {
	try {
		const s = await stat(TEST_FILES);
		if (!s.isFile()) return [];
		const zip = new AdmZip(TEST_FILES);
		const zfiles = zip
			.getEntries()
			.filter((zipEntry) => {
				return (
					!(
						zipEntry.entryName.startsWith("__") ||
						zipEntry.entryName.startsWith(".")
					) && zipEntry.entryName.endsWith(".txt")
				);
			})
			.map((zipEntry) => {
				const zfile: ZFile = {
					name: zipEntry.entryName,
					data: zipEntry.getData().toString("utf8"),
					lines: [],
				};
				zfile.lines = zfile.data.split("\n");
				return zfile;
			});
		return zfiles;
	} catch (err) {
		//console.warn(`could not open ${TEST_FILES}`);
	}
	return [];
}

afterEach(async () => {
	await dots.shutdown();
});

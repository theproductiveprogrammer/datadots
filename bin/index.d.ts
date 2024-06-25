export type Dot<T> = {
    name: string;
    add: (record: T) => void;
    q: (cb: qCallBack<T>) => void;
    close: () => Promise<void>;
};
export type Config<T> = {
    saveEvery: number;
    persister: Persister<T>;
    optimizer?: Optimizer<T>;
};
export type Persister<T> = {
    save: (dbname: string, dotdata: DotData<T>) => Promise<void>;
    load: (dbname: string) => Promise<DotData<T>>;
};
export type Optimizer<T> = (dotdata: DotData<T>) => void;
export type DotData<T> = {
    saved: number;
    records: Array<T>;
    _rollover: boolean;
};
export type qCallBack<T> = (records: Array<T>) => void;
export declare function browserPersister<T>(): Persister<T>;
export declare function memoryPersister<T>(): Persister<T>;
declare function setup<T>(dbname: string, config: Config<T>): Promise<Dot<T>>;
declare function shutdown(): Promise<void>;
declare const dots: {
    setup: typeof setup;
    shutdown: typeof shutdown;
};
export default dots;
//# sourceMappingURL=index.d.ts.map
# Data Dots

Handle thousands of tiny json data "dots".

![icon](./icon.svg)

DataDots is a plain, reasonably powered, database of JSON-files.

## Motivation

-   Being JSON-native makes data easy to work with and easy to debug and understand (all you need is a text editor).
-   Being append-only means the data is almost impossible to corrupt
-   Being text-based means it is easy to compress, share, and transmit
-   Being JSON, records are easy to rewrite/transform as the application grows and morphs.
-   Being file-based, it is easy to create per-user or per-tenant files and manage them naturally.

## QuickStart

Install:

```sh
npm install datadots
```

Use:

```javascript
import dots { diskPersister, compressDuplicates } from "datadots";

database1 = "/path/to/data1.db";

dots.setup(database1, {
    saveEvery: 10, // seconds
    persister: diskPersister(database1),
    processor: compressDuplicates,
});

const datum = { id: typeid("type1"), key: value, key2: value2 };
const record = dots.recordFrom(datum); // ["17Jun24222648+1000","type1_hdnq00zLSZNd","key","value","key2","value"]
dots.add(database1, record);
dots.q(database1, dotdata => {
    console.log(`There are ${dotdata.records.length} records`);
    console.log(`Of which, ${dotdata.saved} are persisted/saved`);
});
```

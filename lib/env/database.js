const { MongoClient } = require("mongodb");
const _ = require("lodash");

module.exports = {
  async connect(config) {
    const url = _.get(config, "mongodb.url");
    const databaseName = _.get(config, "mongodb.databaseName");
    const options = _.get(config, "mongodb.options");

    if (!url) {
      throw new Error("No `url` defined in config file!");
    }

    const client = await MongoClient.connect(url, options);

    const db = client.db(databaseName);
    db.close = client.close;
    return {
      client,
      db,
    };
  },
};

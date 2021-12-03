import React from "react";
import Web3 from "web3";
import { DateTime } from "luxon";
import _ from "lodash";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  TimeScale,
  PointElement,
  LineElement,
} from "chart.js";
import "chartjs-adapter-luxon";
import { Bar, Line } from "react-chartjs-2";
import daiBondAbi from "./abi/daiBond.json";
import wftmBondAbi from "./abi/wFtmBond.json";
import spaDaiLpAbi from "./abi/spaDaiLp.json";
import spaDaiLpBondAbi from "./abi/spaDaiLpBond.json";
import config from "./config.json";
import { alpha } from "@mui/material/styles";
import { red, green, blue, purple } from "@mui/material/colors";
import axios from "axios";
import Grid from "@mui/material/Grid";
import Container from "@mui/material/Container";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import { useQuery, gql } from "@apollo/client";

const RED = red[500];
const GREEN = green[500];
const BLUE = blue[500];
const PURPLE = purple[500];

function transparentize(value, opacity) {
  var a = opacity === undefined ? 0.5 : 1 - opacity;
  return alpha(value, a);
}

ChartJS.register(
  TimeScale,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

const web3 = new Web3(new Web3.providers.HttpProvider(config.provider.host));

const daiBondContract = new web3.eth.Contract(
  daiBondAbi,
  config.contracts.daiBond.address
);

const wftmBondContract = new web3.eth.Contract(
  wftmBondAbi,
  config.contracts.wFtmBond.address
);

const spaDaiLpBondContract = new web3.eth.Contract(
  spaDaiLpBondAbi,
  config.contracts.spaDaiLpBond.address
);

const spaDaiLpContract = new web3.eth.Contract(
  spaDaiLpAbi,
  config.contracts.spaDaiLp.address
);

let cachedBlockNumber = null;
/** @type {Record<string, import('luxon').DateTime>} */
let blockTimestampCache = {};

/**
 *
 * @param {number} blockNumber
 * @returns {Promise<import('luxon').DateTime>}
 */
const getBlockDateTime = async (blockNumber) => {
  if (blockTimestampCache[blockNumber]) {
    return blockTimestampCache[blockNumber];
  }

  if (
    cachedBlockNumber !== null &&
    Math.abs(blockNumber - cachedBlockNumber) < 1000000
  ) {
    const seconds = (blockNumber - cachedBlockNumber) * BLOCKS_PER_SECOND;

    const datetime = blockTimestampCache[cachedBlockNumber].plus({ seconds });

    blockTimestampCache[blockNumber] = datetime;

    return datetime;
  }

  const { timestamp } = await web3.eth.getBlock(blockNumber);

  const datetime = DateTime.fromSeconds(timestamp);
  console.log(datetime.toString());

  cachedBlockNumber = blockNumber;

  blockTimestampCache[blockNumber] = datetime;

  return datetime;
};

/**
 * @typedef {object} ParsedDaiBond
 * @property {number} deposit
 * @property {Date} createdAt
 * @property {Date} expiresAt
 * @property {number} priceInUSD
 */

/**
 * @typedef {object} Price
 * @property {number} price
 * @property {string} date
 */

/**
 * @typedef {object} Data
 * @property {ParsedDaiBond[]} daiBonds
 * @property {ParsedDaiBond[]} wftmBonds
 * @property {ParsedDaiBond[]} spaDaiLpBonds
 */

const BLOCKS_PER_SECOND = 0.87;

const QUERY = gql`
  query getSpaPrice {
    spa: tokens(where: { id: "0x5602df4a94eb6c680190accfa2a475621e0ddbdc" }) {
      tokenDayData {
        date
        priceUSD
      }
    }
    wftm: tokens(where: { id: "0x21be370d5312f44cb42ce377bc9b8a0cef1a4c83" }) {
      tokenDayData(where: { date_gte: 1635724800 }) {
        date
        priceUSD
      }
    }
  }
`;

function App() {
  const [error, setError] = React.useState(null);
  const [
    /** @type {Data|null} */
    data,
    setData,
  ] = React.useState(null);

  const { data: priceData, loading, error: apolloError } = useQuery(QUERY);

  React.useEffect(() => {
    async function load() {
      try {
        const [daiBonds, wftmBonds, spaDaiLpBonds] = await Promise.all([
          daiBondContract.getPastEvents("BondCreated", {
            fromBlock: config.contracts.daiBond.fromBlock,
          }),
          wftmBondContract.getPastEvents("BondCreated", {
            fromBlock: config.contracts.wFtmBond.fromBlock,
          }),
          spaDaiLpBondContract.getPastEvents("BondCreated", {
            fromBlock: config.contracts.spaDaiLpBond.fromBlock,
          }),
        ]);

        /** @type {ParsedDaiBond[]} */
        const parsedDaiBonds = [];

        for (const bond of daiBonds) {
          const { blockNumber, returnValues } = bond;

          /** @type {{deposit: string; payout: string; expires: string; priceInUSD: string;}} */
          const { deposit, expires, priceInUSD } = returnValues;

          const expiresBlock = parseInt(expires);

          const createdAtDateTime = await getBlockDateTime(blockNumber);

          const bondVestSeconds =
            (expiresBlock - blockNumber) * BLOCKS_PER_SECOND;

          parsedDaiBonds.push({
            deposit: parseInt(deposit) / 10 ** 18,
            createdAt: createdAtDateTime.toJSDate(),
            expiresAt: createdAtDateTime
              .plus({ seconds: bondVestSeconds })
              .toJSDate(),
            priceInUSD: parseInt(priceInUSD) / 10 ** 18,
          });
        }

        const parsedWftmBonds = [];

        for (const bond of wftmBonds) {
          const { blockNumber, returnValues } = bond;

          /** @type {{deposit: string; payout: string; expires: string; priceInUSD: string;}} */
          const { deposit, priceInUSD } = returnValues;

          const createdAtDateTime = await getBlockDateTime(blockNumber);
          parsedWftmBonds.push({
            deposit: parseInt(deposit) / 10 ** 18,
            createdAt: createdAtDateTime.toJSDate(),
            priceInUSD: parseInt(priceInUSD) / 10 ** 18,
          });
        }

        const parsedSpaDaiLpBonds = [];

        const spaDaiLpDecimals = await spaDaiLpContract.methods
          .decimals()
          .call();

        for (const bond of spaDaiLpBonds) {
          const { blockNumber, returnValues } = bond;

          /** @type {{deposit: string; payout: string; expires: string; priceInUSD: string;}} */
          const { deposit, priceInUSD } = returnValues;

          const createdAtDateTime = await getBlockDateTime(blockNumber);
          parsedSpaDaiLpBonds.push({
            deposit: parseInt(deposit) / 10 ** spaDaiLpDecimals,
            createdAt: createdAtDateTime.toJSDate(),
            priceInUSD: parseInt(priceInUSD) / 10 ** 18,
          });
        }

        setData({
          daiBonds: parsedDaiBonds,
          wftmBonds: parsedWftmBonds,
          spaDaiLpBonds: parsedSpaDaiLpBonds,
        });
      } catch (err) {
        console.error(err);
        setError(err.message || "???");
      }
    }

    load();
  }, []);

  if (error || apolloError) {
    return (
      <Container sx={{ pt: 30 }}>
        <Stack justifyContent="center" alignItems="center">
          <Alert severity="error">Failed to load data</Alert>
        </Stack>
      </Container>
    );
  }

  if (data === null || loading || !priceData) {
    return (
      <Container sx={{ pt: 30 }}>
        <Stack spacing={4} justifyContent="center" alignItems="center">
          <CircularProgress />
          <Typography variant="h6">Loading</Typography>
        </Stack>
      </Container>
    );
  }

  const bondsByDay = _.mapValues(
    {
      dai: data.daiBonds,
      wftm: data.wftmBonds,
      spaDaiLpBonds: data.spaDaiLpBonds,
    },
    (value) => _.groupBy(value, (bond) => bond.createdAt.toLocaleDateString())
  );

  const pricesByDay = _.mapValues(priceData, ([{ tokenDayData }]) =>
    tokenDayData.reduce((agg, { date, priceUSD }) => {
      agg[DateTime.fromSeconds(date).toFormat("M/d/yyyy")] = {
        price: parseFloat(priceUSD),
      };
      return agg;
    }, {})
  );

  // const pricesByDay = _.mapValues(
  //   {
  //     spa: data.spaPrices,
  //     wftm: data.wftmPrices,
  //   },
  //   (value) =>
  //     value.reduce((agg, priceData) => {
  //       agg[
  //         DateTime.fromFormat(priceData.date, "yyyy-MM-dd").toFormat("M/d/yyyy")
  //       ] = priceData;
  //       return agg;
  //     }, {})
  // );

  const bondDiscountsByDay = _.mapValues(
    {
      dai: bondsByDay.dai,
      wftm: bondsByDay.wftm,
      spaDaiLpBonds: bondsByDay.spaDaiLpBonds,
    },
    (bondsByD, token) =>
      _.mapValues(bondsByD, (ooga, dateString) => {
        const tokenPrice = pricesByDay.spa[dateString]?.price;

        if (
          tokenPrice === undefined ||
          bondsByDay[token][dateString] === undefined
        ) {
          return null;
        }

        const bonds = bondsByDay[token][dateString];

        const bondPrice =
          _.sumBy(bonds, (bond) => bond.priceInUSD) / bonds.length;

        return ((tokenPrice - bondPrice) / tokenPrice) * 100;
      })
  );

  const labels = Object.keys(bondsByDay.dai);

  labels.sort((l1, l2) => {
    const d1 = DateTime.fromFormat(l1, "M/d/yyyy");
    const d2 = DateTime.fromFormat(l2, "M/d/yyyy");

    if (d1 > d2) {
      return 1;
    } else if (d1 < d2) {
      return -1;
    } else {
      return 0;
    }
  });

  return (
    <Grid container direction="column" spacing={2} sx={{ p: 2 }}>
      <Grid item>{DateTime.now().toString()}</Grid>
      <Grid item style={{ height: 300 }}>
        <Bar
          options={{
            maintainAspectRatio: false,
            plugins: {
              legend: {
                position: "top",
              },
              title: {
                display: true,
                text: "Number of bonds created",
              },
            },
            scales: {
              x: {
                stacked: true,
              },
              y: {
                stacked: true,
              },
            },
          }}
          height={null}
          width={null}
          data={{
            labels,
            datasets: [
              {
                label: "DAI bonds",
                data: labels.map((label) => bondsByDay.dai[label]?.length ?? 0),
                backgroundColor: transparentize(RED, 0.2),
              },
              {
                label: "wFTM bonds",
                data: labels.map(
                  (label) => bondsByDay.wftm[label]?.length ?? 0
                ),
                backgroundColor: transparentize(BLUE, 0.2),
              },
              {
                label: "SPA-DAI bonds",
                data: labels.map(
                  (label) => bondsByDay.spaDaiLpBonds[label]?.length ?? 0
                ),
                backgroundColor: transparentize(GREEN, 0.2),
              },
            ],
          }}
        />
      </Grid>
      <Grid item style={{ height: 300 }}>
        <Bar
          options={{
            maintainAspectRatio: false,
            plugins: {
              legend: {
                position: "top",
              },
              title: {
                display: true,
                text: "Value deposited (USD)",
              },
            },
            scales: {
              y: {
                stacked: true,
              },
              x: {
                stacked: true,
              },
            },
          }}
          height={null}
          width={null}
          data={{
            labels,
            datasets: [
              {
                label: "DAI",
                data: labels.map((label) =>
                  _.sumBy(bondsByDay.dai[label], (bond) => bond.deposit)
                ),
                backgroundColor: transparentize(RED, 0.2),
              },
              {
                label: "wFTM",
                data: labels.map((label) =>
                  pricesByDay.wftm[label]
                    ? _.sumBy(bondsByDay.wftm[label], (bond) => bond.deposit) *
                      pricesByDay.wftm[label].price
                    : null
                ),
                backgroundColor: transparentize(BLUE, 0.2),
              },
            ],
          }}
        />
      </Grid>
      <Grid item style={{ height: 300 }}>
        <Line
          options={{
            maintainAspectRatio: false,
            plugins: {
              legend: {
                position: "top",
              },
              title: {
                display: true,
                text: "Historical Price (USD)",
              },
            },
          }}
          height={null}
          width={null}
          data={{
            labels,
            datasets: [
              {
                label: "SPA",
                data: labels.map(
                  (label) => pricesByDay.spa[label]?.price ?? null
                ),
                borderColor: PURPLE,
                backgroundColor: PURPLE,
                spanGaps: true,
              },
              {
                label: "DAI bonds",
                data: labels.map((label) =>
                  bondsByDay.dai[label]
                    ? _.sumBy(
                        bondsByDay.dai[label],
                        (bond) => bond.priceInUSD
                      ) / bondsByDay.dai[label].length
                    : null
                ),
                borderColor: RED,
                backgroundColor: transparentize(RED, 0.5),
                spanGaps: true,
              },
              {
                label: "wFTM bonds",
                data: labels.map((label) =>
                  bondsByDay.wftm[label]
                    ? _.sumBy(
                        bondsByDay.wftm[label],
                        (bond) => bond.priceInUSD
                      ) / bondsByDay.wftm[label].length
                    : null
                ),
                borderColor: BLUE,
                backgroundColor: transparentize(BLUE, 0.5),
                spanGaps: true,
              },
              {
                label: "SPA-DAI bonds",
                data: labels.map((label) =>
                  bondsByDay.spaDaiLpBonds[label]
                    ? _.sumBy(
                        bondsByDay.spaDaiLpBonds[label],
                        (bond) => bond.priceInUSD
                      ) / bondsByDay.spaDaiLpBonds[label].length
                    : null
                ),
                borderColor: GREEN,
                backgroundColor: transparentize(GREEN, 0.5),
                spanGaps: true,
              },
            ],
          }}
        />
      </Grid>
      <Grid item style={{ height: 300 }}>
        <Bar
          options={{
            maintainAspectRatio: false,
            plugins: {
              legend: {
                position: "top",
              },
              title: {
                display: true,
                text: "Bond Discounts (%)",
              },
            },
          }}
          height={null}
          width={null}
          data={{
            labels,
            datasets: [
              {
                label: "DAI",
                data: labels.map(
                  (label) => bondDiscountsByDay.dai[label] ?? null
                ),
                backgroundColor: transparentize(RED, 0.2),
                spanGaps: true,
              },
              {
                label: "wFTM",
                data: labels.map(
                  (label) => bondDiscountsByDay.wftm[label] ?? null
                ),
                backgroundColor: transparentize(BLUE, 0.2),
                spanGaps: true,
              },
              {
                label: "SPA-DAI",
                data: labels.map(
                  (label) => bondDiscountsByDay.spaDaiLpBonds[label] ?? null
                ),
                backgroundColor: transparentize(GREEN, 0.2),
                spanGaps: true,
              },
            ],
          }}
        />
      </Grid>
    </Grid>
  );
}

export default App;

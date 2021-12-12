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
import spaBondingCalcAbi from "./abi/spaBondingCalc.json";
import spaAbi from "./abi/spa.json";
import sSpaAbi from "./abi/sSpa.json";
import config from "./config.json";
import { alpha } from "@mui/material/styles";
import { red, green, blue, purple, pink } from "@mui/material/colors";
import Grid from "@mui/material/Grid";
import Container from "@mui/material/Container";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import { useQuery, gql } from "@apollo/client";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import Paper from "@mui/material/Paper";
import { ApolloClient, InMemoryCache } from "@apollo/client";
import {
  Table,
  TableContainer,
  TableBody,
  TableHead,
  TableCell,
  TableRow,
  Link,
  Button,
  Divider,
} from "@mui/material";

const spookySwapClient = new ApolloClient({
  uri: "https://api.thegraph.com/subgraphs/name/eerieeight/spookyswap",
  cache: new InMemoryCache(),
});

const spaClient = new ApolloClient({
  uri: "https://api.thegraph.com/subgraphs/name/spartacus-finance/ftm2",
  cache: new InMemoryCache(),
});

const RED = red[500];
const GREEN = green[500];
const BLUE = blue[500];
const PURPLE = purple[500];
const PINK = pink[500];

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

const web3 = new Web3(
  new Web3.providers.WebsocketProvider(config.provider.host)
);

const spaContract = new web3.eth.Contract(spaAbi, config.contracts.spa.address);

const sSpaContract = new web3.eth.Contract(
  sSpaAbi,
  config.contracts.sSpa.address
);

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

const spaBondingCalcContract = new web3.eth.Contract(
  spaBondingCalcAbi,
  config.contracts.spaBondingCalc.address
);

let cachedBlockNumber = null;
/** @type {Record<string, import('luxon').DateTime>} */
let blockTimestampCache = {};

/**
 *
 * @param {number} blockNumber
 * @returns {Promise<import('luxon').DateTime>}
 */
const getBlockDateTime = async (blockNumber, force = false) => {
  if (blockTimestampCache[blockNumber]) {
    return blockTimestampCache[blockNumber];
  }

  if (
    !force &&
    cachedBlockNumber !== null &&
    Math.abs(blockNumber - cachedBlockNumber) < 1000000
  ) {
    const seconds = (blockNumber - cachedBlockNumber) * BLOCKS_PER_SECOND;

    const datetime = blockTimestampCache[cachedBlockNumber].plus({ seconds });

    blockTimestampCache[blockNumber] = datetime;

    return datetime;
  }
  console.log(blockNumber);
  const { timestamp } = await web3.eth.getBlock(blockNumber);

  const datetime = DateTime.fromSeconds(timestamp);

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

const SPA_QUERY = gql`
  query getSpa {
    rebases(first: 1000, orderBy: timestamp, orderDirection: asc) {
      amount
      stakedOhms
      percentage
      timestamp
      value
    }
    protocolMetrics(orderBy: timestamp, orderDirection: asc) {
      timestamp
      totalSupply
    }
  }
`;

const SPOOKYSWAP_QUERY = gql`
  query getSpaPrice {
    pair(id: "0xfa5a5f0bc990be1d095c5385fff6516f6e03c0a7") {
      reserve0
      reserve1
    }
    spa: tokens(where: { id: "0x5602df4a94eb6c680190accfa2a475621e0ddbdc" }) {
      tokenDayData(orderBy: date) {
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
    pairDayDatas(
      where: { pairAddress: "0xfa5a5f0bc990be1d095c5385fff6516f6e03c0a7" }
    ) {
      date
      reserveUSD
      totalSupply
    }
  }
`;

const LABELS = {
  spa: "SPA",
  dai: "DAI",
  wftm: "wFTM",
  spaDaiLp: "SPA-DAI",
};

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",

  // These options are needed to round to whole numbers if that's what you want.
  //minimumFractionDigits: 0, // (this suffices for whole numbers, but will print 2500.10 as $2,500.1)
  //maximumFractionDigits: 0, // (causes 2500.99 to be printed as $2,501)
});

const tokenFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

const percentFormatter = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 2,
});

const formatUSD = (num) => usdFormatter.format(num);
const formatToken = (num) => tokenFormatter.format(num);
const formatPercent = (num) => percentFormatter.format(num);

function App() {
  const [error, setError] = React.useState(null);
  const [
    /** @type {Data|null} */
    data,
    setData,
  ] = React.useState(null);

  const {
    data: spaData,
    loading: loadingSpa,
    error: spaError,
  } = useQuery(SPA_QUERY, { client: spaClient });
  const {
    data: priceData,
    loading,
    error: apolloError,
  } = useQuery(SPOOKYSWAP_QUERY, { client: spookySwapClient });

  React.useEffect(() => {
    async function load() {
      try {
        const [
          rebases,
          daiBonds,
          wftmBonds,
          spaDaiLpBonds,
          daiBcv,
          wftmBcv,
          spaDaiBcv,
        ] = await Promise.all([
          sSpaContract.getPastEvents("LogRebase", {
            fromBlock: config.contracts.sSpa.fromBlock,
          }),
          daiBondContract.getPastEvents("BondCreated", {
            fromBlock: config.contracts.daiBond.fromBlock,
          }),
          wftmBondContract.getPastEvents("BondCreated", {
            fromBlock: config.contracts.wFtmBond.fromBlock,
          }),
          spaDaiLpBondContract.getPastEvents("BondCreated", {
            fromBlock: config.contracts.spaDaiLpBond.fromBlock,
          }),
          daiBondContract.getPastEvents("ControlVariableAdjustment", {
            fromBlock: config.contracts.daiBond.fromBlock,
          }),
          wftmBondContract.getPastEvents("ControlVariableAdjustment", {
            fromBlock: config.contracts.wFtmBond.fromBlock,
          }),
          spaDaiLpBondContract.getPastEvents("ControlVariableAdjustment", {
            fromBlock: config.contracts.spaDaiLpBond.fromBlock,
          }),
        ]);

        /** @type {ParsedDaiBond[]} */
        const parsedDaiBonds = [];

        for (const bond of daiBonds) {
          const { blockNumber, returnValues } = bond;

          /** @type {{deposit: string; payout: string; expires: string; priceInUSD: string;}} */
          const { deposit, expires, payout, priceInUSD } = returnValues;

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
            payout: parseFloat(payout) / 10 ** 9,
          });
        }

        const parsedWftmBonds = [];

        for (const bond of wftmBonds) {
          const { blockNumber, returnValues } = bond;

          /** @type {{deposit: string; payout: string; expires: string; priceInUSD: string;}} */
          const { deposit, priceInUSD, payout } = returnValues;

          const createdAtDateTime = await getBlockDateTime(blockNumber);
          parsedWftmBonds.push({
            deposit: parseInt(deposit) / 10 ** 18,
            createdAt: createdAtDateTime.toJSDate(),
            priceInUSD: parseInt(priceInUSD) / 10 ** 18,
            payout: parseFloat(payout) / 10 ** 9,
          });
        }

        const parsedSpaDaiLpBonds = [];

        const spaDaiLpDecimals = await spaDaiLpContract.methods
          .decimals()
          .call();

        for (const bond of spaDaiLpBonds) {
          const { blockNumber, returnValues } = bond;

          /** @type {{deposit: string; payout: string; expires: string; priceInUSD: string;}} */
          const { deposit, priceInUSD, payout } = returnValues;

          const createdAtDateTime = await getBlockDateTime(blockNumber);
          parsedSpaDaiLpBonds.push({
            deposit: parseInt(deposit) / 10 ** spaDaiLpDecimals,
            createdAt: createdAtDateTime.toJSDate(),
            priceInUSD: parseInt(priceInUSD) / 10 ** 18,
            payout: parseFloat(payout) / 10 ** 9,
          });
        }

        const bcvChanges = [];

        for (const bcv of daiBcv) {
          const { blockNumber, returnValues } = bcv;

          const changedAt = await getBlockDateTime(blockNumber);

          bcvChanges.push({ changedAt, returnValues, bond: "dai" });
        }

        for (const bcv of wftmBcv) {
          const { blockNumber, returnValues } = bcv;

          const changedAt = await getBlockDateTime(blockNumber);

          bcvChanges.push({ changedAt, returnValues, bond: "wftm" });
        }

        for (const bcv of spaDaiBcv) {
          const { blockNumber, returnValues } = bcv;

          const changedAt = await getBlockDateTime(blockNumber);

          bcvChanges.push({ changedAt, returnValues, bond: "spaDaiLp" });
        }
        const parsedRebases = [];
        for (const rebase of rebases) {
          const { blockNumber, returnValues } = rebase;

          const { epoch, index } = returnValues;

          const rebasedAt = await getBlockDateTime(blockNumber, true);

          parsedRebases.push({ blockNumber, rebasedAt, index, epoch });
        }

        const info = {
          dai: {
            ...(await daiBondContract.methods.terms().call()),
            currentDebt: await daiBondContract.methods.currentDebt().call(),
            basePrice: await daiBondContract.methods.basePrice().call(),
            debtRatio: await daiBondContract.methods.debtRatio().call(),
          },
          wftm: {
            ...(await wftmBondContract.methods.terms().call()),
            currentDebt: await wftmBondContract.methods.currentDebt().call(),
            basePrice: await wftmBondContract.methods.basePrice().call(),
            debtRatio: await wftmBondContract.methods.debtRatio().call(),
          },
          spaDaiLp: {
            ...(await spaDaiLpBondContract.methods.terms().call()),
            currentDebt: await spaDaiLpBondContract.methods
              .currentDebt()
              .call(),
            basePrice: await spaDaiLpBondContract.methods.basePrice().call(),
            debtRatio: await spaDaiLpBondContract.methods.debtRatio().call(),
            markdown: await spaBondingCalcContract.methods
              .markdown(config.contracts.spaDaiLp.address)
              .call(),
          },
        };

        const spa = {
          totalSupply: await spaContract.methods.totalSupply().call(),
        };

        setData({
          rebases: parsedRebases,
          daiBonds: parsedDaiBonds,
          wftmBonds: parsedWftmBonds,
          spaDaiLpBonds: parsedSpaDaiLpBonds,
          bcvChanges,
          info,
          spa,
          wftm: { price: 0 },
          spaDaiLp: { price: 0 },
        });
      } catch (err) {
        console.error(err);
        setError(err.message || "???");
      }
    }

    load();
  }, []);

  React.useLayoutEffect(() => {
    if (data === null || loading || loadingSpa || !priceData) {
      return;
    }

    if (!window.location.href.endsWith("#rebase-index")) {
      return;
    }

    document
      .getElementById("rebase-index")
      .scrollIntoView({ behavior: "smooth" });
  }, [data, loading, loadingSpa, priceData]);

  if (error || apolloError || spaError) {
    return (
      <Container sx={{ pt: 30 }}>
        <Stack justifyContent="center" alignItems="center">
          <Alert severity="error">Failed to load data</Alert>
        </Stack>
      </Container>
    );
  }

  if (data === null || loading || loadingSpa || !priceData) {
    return (
      <Container sx={{ pt: 30 }}>
        <Stack spacing={4} justifyContent="center" alignItems="center">
          <CircularProgress />
          <Typography variant="h6">Loading</Typography>
          <Typography>
            This could take a minute or two, thank you for your patience!
          </Typography>
          <Divider />
          <Stack spacing={2}>
            {data === null && (
              <Alert severity="info">Loading on-chain data</Alert>
            )}
            {loading && <Alert severity="info">Loading SpookySwap data</Alert>}
            {loadingSpa && (
              <Alert severity="info">Loading Spartacus data</Alert>
            )}
            {data !== null && (
              <Alert severity="success">Loaded on-chain data</Alert>
            )}
            {priceData && (
              <Alert severity="success">Loaded SpookySwap data</Alert>
            )}
            {spaData && <Alert severity="success">Loaded Spartacus data</Alert>}
          </Stack>
        </Stack>
      </Container>
    );
  }

  const rebases = spaData.rebases.map((rebase) => {
    const { timestamp, ...values } = _.mapValues(rebase, parseFloat);

    return {
      rebasedAt: DateTime.fromSeconds(timestamp),
      ...values,
    };
  });

  const rebaseByDay = _.mapValues(
    _.groupBy(rebases, ({ rebasedAt }) => rebasedAt.toFormat("M/d/yyyy")),
    (rebases) => {
      return {
        amount: _.sumBy(rebases, (rebase) => rebase.amount),
        stakedOhms:
          _.sumBy(rebases, (rebase) => rebase.stakedOhms) / rebases.length,
      };
    }
  );

  const protocolMetrics = spaData.protocolMetrics.slice(2).map((metrics) => {
    const { timestamp, ...values } = _.mapValues(metrics, parseFloat);

    return {
      timestamp: DateTime.fromSeconds(timestamp),
      ...values,
    };
  });

  const bondsByDay = _.mapValues(
    {
      dai: data.daiBonds,
      wftm: data.wftmBonds,
      spaDaiLpBonds: data.spaDaiLpBonds,
    },
    (value) => _.groupBy(value, (bond) => bond.createdAt.toLocaleDateString())
  );

  data.spa.price =
    parseFloat(priceData.pair.reserve1) / parseFloat(priceData.pair.reserve0);

  const pricesByDay = _.mapValues(
    {
      spa: priceData.spa,
      wftm: priceData.wftm,
      spaDaiLpBonds: priceData.pairDayDatas,
    },
    (arr, token) =>
      (arr.length === 1 ? arr[0].tokenDayData : arr).reduce(
        (agg, { date, priceUSD, reserveUSD, totalSupply }, index, arr) => {
          const price = parseFloat(reserveUSD ?? priceUSD) / (totalSupply ?? 1);
          agg[DateTime.fromSeconds(date).toFormat("M/d/yyyy")] = {
            price,
          };
          if (token === "wftm") {
            data.wftm.price = price;
          }
          if (token === "spaDaiLpBonds") {
            data.spaDaiLp.price = price;
          }
          return agg;
        },
        {}
      )
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

  const bondDiscountsByDay = _.mapValues(
    {
      dai: bondsByDay.dai,
      wftm: bondsByDay.wftm,
      spaDaiLpBonds: bondsByDay.spaDaiLpBonds,
    },
    (bondsByD, token) =>
      _.mapValues(bondsByD, (ooga, dateString) => {
        const tokenPrice =
          labels.indexOf(dateString) === labels.length - 1
            ? data.spa.price
            : pricesByDay.spa[dateString]?.price ?? null;

        if (
          tokenPrice === null ||
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

  return (
    <Grid container direction="column" spacing={2} sx={{ p: 2 }}>
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
              {
                label: "SPA-DAI",
                data: labels.map((label) =>
                  pricesByDay.spaDaiLpBonds[label]
                    ? _.sumBy(
                        bondsByDay.spaDaiLpBonds[label],
                        (bond) => bond.deposit
                      ) * pricesByDay.spaDaiLpBonds[label].price
                    : null
                ),
                backgroundColor: transparentize(GREEN, 0.2),
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
                data: labels.map((label, index) =>
                  index === labels.length - 1
                    ? data.spa.price
                    : pricesByDay.spa[label]?.price ?? null
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
                borderColor: transparentize(RED, 0.5),
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
                borderColor: transparentize(BLUE, 0.5),
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
                borderColor: transparentize(GREEN, 0.5),
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
                text: "SPA minted for bond payout",
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
                  _.sumBy(bondsByDay.dai[label], (bond) => bond.payout)
                ),
                backgroundColor: transparentize(RED, 0.2),
              },
              {
                label: "wFTM",
                data: labels.map((label) =>
                  pricesByDay.wftm[label]
                    ? _.sumBy(bondsByDay.wftm[label], (bond) => bond.payout)
                    : null
                ),
                backgroundColor: transparentize(BLUE, 0.2),
              },
              {
                label: "SPA-DAI",
                data: labels.map((label) =>
                  pricesByDay.spaDaiLpBonds[label]
                    ? _.sumBy(
                        bondsByDay.spaDaiLpBonds[label],
                        (bond) => bond.payout
                      )
                    : null
                ),
                backgroundColor: transparentize(GREEN, 0.2),
              },
            ],
          }}
        />
      </Grid>
      <Grid item container spacing={4} style={{ minHeight: 300 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6">BCV Changes</Typography>
            <List style={{ height: 200, overflowY: "auto" }}>
              {_.orderBy(
                data.bcvChanges,
                [(bcvChange) => bcvChange.changedAt],
                ["desc"]
              ).map(
                ({ bond, changedAt, returnValues: { initialBCV, newBCV } }) => (
                  <ListItem key={changedAt.toString()} divider>
                    <ListItemText
                      primary={`${LABELS[bond]}: ${initialBCV} -> ${newBCV}`}
                      secondary={changedAt.toLocaleString(
                        DateTime.DATETIME_FULL
                      )}
                    ></ListItemText>
                  </ListItem>
                )
              )}
            </List>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={6} md={9} container spacing={4}>
          <Grid item>
            <Paper sx={{ p: 4, my: 2 }}>
              <Typography variant="h6">SPA</Typography>
              <Typography>
                Total Supply: {formatToken(data.spa.totalSupply / 10 ** 9)} SPA
              </Typography>
              <Typography>Price: {formatUSD(data.spa.price)}</Typography>
            </Paper>
          </Grid>
          <Grid item>
            <Paper sx={{ p: 4, my: 2 }}>
              <Typography variant="h6">wFTM</Typography>

              <Typography>Price: {formatUSD(data.wftm.price)}</Typography>
            </Paper>
          </Grid>
          {Object.entries(data.info).map(
            ([
              key,
              { controlVariable, maxPayout, basePrice, currentDebt, debtRatio },
            ]) => {
              const calcDebtRatio = currentDebt / data.spa.totalSupply / 100;
              const maxSpaPayout =
                (maxPayout / 1000 / 100) * (data.spa.totalSupply / 10 ** 9);
              let price =
                (((controlVariable * parseFloat(debtRatio) +
                  parseFloat(basePrice)) /
                  10 ** 7) *
                  10 ** 9) /
                100 /
                10 ** 9;
              console.log(price);
              if (key === "wftm") {
                price *= data.wftm.price;
              }
              if (key === "spaDaiLp") {
                const kvalue =
                  (parseFloat(priceData.pair.reserve0) *
                    parseFloat(priceData.pair.reserve1)) /
                  10 ** 18;
                const totalvalue = Math.sqrt(kvalue) * 2;
                const markdown =
                  (parseFloat(priceData.pair.reserve1) * 2) / totalvalue;

                price *= markdown / 10 ** 9;
              }

              return (
                <Grid item key={key}>
                  <Paper sx={{ p: 4, my: 2 }}>
                    <Typography variant="h6">{LABELS[key]}</Typography>
                    <Typography>BCV: {controlVariable}</Typography>
                    <Typography>
                      Base Price: {formatUSD(basePrice / 10 ** 9)}
                    </Typography>
                    <Typography>
                      Max Payout: {formatToken(maxSpaPayout)} SPA (
                      {formatUSD(maxSpaPayout * data.spa.price)})
                    </Typography>
                    <Typography>
                      Current Debt: {formatToken(currentDebt / 10 ** 9 / 100)}{" "}
                      SPA
                    </Typography>
                    <Typography>
                      Debt Ratio: {formatPercent(calcDebtRatio)}
                    </Typography>
                    <Typography>
                      Price: {formatUSD(price)} = {controlVariable} *{" "}
                      {Number(calcDebtRatio).toFixed(2)} +{" "}
                      {formatUSD(basePrice / 10 ** 9)}
                    </Typography>
                    <Typography>
                      Discount:{" "}
                      {formatPercent((data.spa.price - price) / price)}
                    </Typography>
                  </Paper>
                </Grid>
              );
            }
          )}
        </Grid>
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
                text: "Rebase Amount",
              },
            },
          }}
          height={null}
          width={null}
          data={{
            labels,
            datasets: [
              {
                label: "sSPA",
                data: labels.map((label) => rebaseByDay[label]?.amount ?? null),
                backgroundColor: transparentize(PINK, 0.2),
                spanGaps: true,
              },
            ],
          }}
        />
      </Grid>
      <Grid item id="rebase-index">
        <Typography variant="h6">
          Rebase Index ({data.rebases.length} total rebases)
        </Typography>
        <Button
          variant="contained"
          onClick={() => {
            let s = "data:text/csv;charset=utf-8,";

            s += "block,timestamp,epoch,index\r\n";

            data.rebases.forEach(({ blockNumber, rebasedAt, epoch, index }) => {
              s += `${blockNumber},${rebasedAt.toString()},${epoch},${
                index / data.rebases[0].index
              }\r\n`;
            });

            window.open(encodeURI(s));
          }}
        >
          Export CSV
        </Button>
        <TableContainer sx={{ maxHeight: 300 }}>
          <Table stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Block no.</TableCell>
                <TableCell>Datetime</TableCell>
                <TableCell>Epoch</TableCell>
                <TableCell>Index</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.rebases.map(({ blockNumber, rebasedAt, epoch, index }) => (
                <TableRow key={rebasedAt.toString()}>
                  <TableCell>
                    <Link
                      href={`http://ftmscan.com/block/${blockNumber}`}
                      title="Link to ftmscan block"
                      target="_blank"
                    >
                      {blockNumber}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {rebasedAt.toLocaleString(DateTime.DATETIME_FULL)}
                  </TableCell>
                  <TableCell>{epoch}</TableCell>
                  <TableCell>
                    {Number(index / data.rebases[0].index).toFixed(3)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
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
                text: "SPA over time",
              },
            },
            scales: {
              x: {
                type: "time",
              },
            },
          }}
          height={null}
          width={null}
          data={{
            datasets: [
              {
                label: "Staked SPA",
                data: [
                  { x: DateTime.fromFormat(labels[0], "M/d/yyyy"), y: null },
                  ..._.sortBy(
                    rebases.map((rebase) => ({
                      x: rebase.rebasedAt.toJSDate(),
                      y: rebase.stakedOhms,
                    })),
                    "x"
                  ),
                ],
                fill: PINK,
                borderColor: PINK,
                backgroundColor: transparentize(PINK, 0.2),
              },
              {
                label: "SPA Total Supply",
                data: [
                  { x: DateTime.fromFormat(labels[0], "M/d/yyyy"), y: null },
                  ..._.sortBy(
                    protocolMetrics.map((metrics) => ({
                      x: metrics.timestamp.toJSDate(),
                      y: metrics.totalSupply,
                    })),
                    "x"
                  ),
                ],

                fill: PURPLE,
                borderColor: PURPLE,
                backgroundColor: transparentize(PURPLE, 0.2),
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
                text: "Total Supply Growth",
              },
            },
            scales: {
              x: {
                type: "time",
                time: {
                  unit: "day",
                },
              },
            },
          }}
          height={null}
          width={null}
          data={{
            datasets: [
              {
                label: "SPA",
                data: [
                  { x: DateTime.fromFormat(labels[0], "M/d/yyyy"), y: null },
                  ..._.sortBy(
                    protocolMetrics.slice(1).map((metrics, index) => ({
                      x: metrics.timestamp.startOf("day").toJSDate(),
                      y:
                        metrics.totalSupply -
                        protocolMetrics[index].totalSupply,
                    })),
                    "x"
                  ),
                ],
                backgroundColor: transparentize(PURPLE, 0.2),
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
                text: "Total Supply Growth (%)",
              },
            },
            scales: {
              x: {
                type: "time",
                time: {
                  unit: "day",
                },
              },
            },
          }}
          height={null}
          width={null}
          data={{
            datasets: [
              {
                label: "SPA",
                data: [
                  { x: DateTime.fromFormat(labels[0], "M/d/yyyy"), y: null },
                  ..._.sortBy(
                    protocolMetrics.slice(1).map((metrics, index) => ({
                      x: metrics.timestamp.startOf("day").toJSDate(),
                      y:
                        ((metrics.totalSupply -
                          protocolMetrics[index].totalSupply) /
                          metrics.totalSupply) *
                        100,
                    })),
                    "x"
                  ),
                ],
                backgroundColor: transparentize(PURPLE, 0.2),
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

import request from 'request-promise';
import { v4 } from 'uuid';
import { Logger } from '../../utils/logger.js';
import { Common } from '../../utils/common.js';
import { Database } from '../../utils/database.js';
let options = null;
const logger = Logger;
const common = Common;
function paymentReducer(accumulator, currentPayment) {
    const currPayHash = currentPayment.payment_hash;
    if (!currentPayment.partid) {
        currentPayment.partid = 0;
    }
    if (!accumulator[currPayHash]) {
        accumulator[currPayHash] = [currentPayment];
    }
    else {
        accumulator[currPayHash].push(currentPayment);
    }
    return accumulator;
}
function summaryReducer(accumulator, mpp) {
    if (mpp.status === 'complete') {
        accumulator.msatoshi = accumulator.msatoshi + mpp.msatoshi;
        accumulator.msatoshi_sent = accumulator.msatoshi_sent + mpp.msatoshi_sent;
        accumulator.status = mpp.status;
    }
    return accumulator;
}
function groupBy(payments) {
    const paymentsInGroups = payments.reduce(paymentReducer, {});
    const paymentsGrpArray = Object.keys(paymentsInGroups).map((key) => ((paymentsInGroups[key].length && paymentsInGroups[key].length > 1) ? common.sortDescByKey(paymentsInGroups[key], 'partid') : paymentsInGroups[key]));
    return paymentsGrpArray.reduce((acc, curr) => {
        let temp = {};
        if (curr.length && curr.length === 1) {
            temp = JSON.parse(JSON.stringify(curr[0]));
            temp.is_group = false;
            temp.is_expanded = false;
            temp.total_parts = 1;
            delete temp.partid;
        }
        else {
            const paySummary = curr.reduce(summaryReducer, { msatoshi: 0, msatoshi_sent: 0, status: (curr[0] && curr[0].status) ? curr[0].status : 'failed' });
            temp = {
                is_group: true, is_expanded: false, total_parts: (curr.length ? curr.length : 0), status: paySummary.status, payment_hash: curr[0].payment_hash,
                destination: curr[0].destination, msatoshi: paySummary.msatoshi, msatoshi_sent: paySummary.msatoshi_sent, created_at: curr[0].created_at,
                mpps: curr
            };
        }
        return acc.concat(temp);
    }, []);
}
export const listPayments = (req, res, next) => {
    logger.log({ selectedNode: req.session.selectedNode, level: 'INFO', fileName: 'Payments', msg: 'List Payments..' });
    options = common.getOptions(req);
    if (options.error) {
        return res.status(options.statusCode).json({ message: options.message, error: options.error });
    }
    options.url = req.session.selectedNode.ln_server_url + '/v1/pay/listPayments';
    request(options).then((body) => {
        logger.log({ selectedNode: req.session.selectedNode, level: 'DEBUG', fileName: 'Payments', msg: 'Payment List Received', data: body.payments });
        if (body && body.payments && body.payments.length > 0) {
            body.payments = common.sortDescByKey(body.payments, 'created_at');
        }
        logger.log({ selectedNode: req.session.selectedNode, level: 'INFO', fileName: 'Payments', msg: 'List Payments Received' });
        res.status(200).json(groupBy(body.payments));
    }).catch((errRes) => {
        const err = common.handleError(errRes, 'Payments', 'List Payments Error', req.session.selectedNode);
        return res.status(err.statusCode).json({ message: err.message, error: err.error });
    });
};
export const decodePayment = (req, res, next) => {
    logger.log({ selectedNode: req.session.selectedNode, level: 'INFO', fileName: 'Payments', msg: 'Decoding Payment..' });
    options = common.getOptions(req);
    if (options.error) {
        return res.status(options.statusCode).json({ message: options.message, error: options.error });
    }
    options.url = req.session.selectedNode.ln_server_url + '/v1/utility/decode/' + req.params.payReq;
    request(options).then((body) => {
        logger.log({ selectedNode: req.session.selectedNode, level: 'DEBUG', fileName: 'Payments', msg: 'Payment Decode Received', data: body });
        logger.log({ selectedNode: req.session.selectedNode, level: 'INFO', fileName: 'Payments', msg: 'Payment Decoded' });
        res.status(200).json(body);
    }).catch((errRes) => {
        const err = common.handleError(errRes, 'Payments', 'Decode Payment Error', req.session.selectedNode);
        return res.status(err.statusCode).json({ message: err.message, error: err.error });
    });
};
export const postPayment = (req, res, next) => {
    options = common.getOptions(req);
    if (options.error) {
        return res.status(options.statusCode).json({ message: options.message, error: options.error });
    }
    if (req.body.paymentType === 'KEYSEND') {
        logger.log({ selectedNode: req.session.selectedNode, level: 'INFO', fileName: 'Payments', msg: 'Keysend Payment..' });
        options.url = req.session.selectedNode.ln_server_url + '/v1/pay/keysend';
        options.body = req.body;
    }
    else {
        if (req.body.paymentType === 'OFFER') {
            logger.log({ selectedNode: req.session.selectedNode, level: 'INFO', fileName: 'Payments', msg: 'Sending Offer Payment..' });
            options.body = { invoice: req.body.invoice };
        }
        else {
            logger.log({ selectedNode: req.session.selectedNode, level: 'INFO', fileName: 'Payments', msg: 'Sending Invoice Payment..' });
            options.body = req.body;
        }
        options.url = req.session.selectedNode.ln_server_url + '/v1/pay';
    }
    request.post(options).then((body) => {
        logger.log({ selectedNode: req.session.selectedNode, level: 'DEBUG', fileName: 'Payments', msg: 'Send Payment Response', data: body });
        logger.log({ selectedNode: req.session.selectedNode, level: 'INFO', fileName: 'Payments', msg: 'Payment Sent' });
        if (req.body.paymentType === 'OFFER') {
            if (req.body.saveToDB) {
                const offer = { id: v4(), offer: req.body.offer, amountmSat: req.body.amount, label: req.body.label, issuer: req.body.issuer, description: req.body.description };
                return Database.offer.create(offer).then((savedOffer) => {
                    logger.log({ level: 'DEBUG', fileName: 'Offer', msg: 'Offer Saved', data: savedOffer });
                    return res.status(201).json({ paymentResponse: body, saveToDBResponse: savedOffer.dataValues });
                }).catch((errDB) => {
                    logger.log({ selectedNode: req.session.selectedNode, level: 'ERROR', fileName: 'Payments', msg: 'Offer DB save error', error: errDB });
                    return res.status(201).json({ paymentResponse: body, saveToDBError: errDB });
                });
            }
            else {
                return res.status(201).json({ paymentResponse: body, saveToDBResponse: 'NA' });
            }
        }
        if (req.body.paymentType === 'INVOICE') {
            return res.status(201).json({ paymentResponse: body, saveToDBResponse: 'NA' });
        }
        if (req.body.paymentType === 'KEYSEND') {
            return res.status(201).json(body);
        }
    }).catch((errRes) => {
        const err = common.handleError(errRes, 'Payments', 'Send Payment Error', req.session.selectedNode);
        return res.status(err.statusCode).json({ message: err.message, error: err.error });
    });
};

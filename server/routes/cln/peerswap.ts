import exprs from 'express';
const { Router } = exprs;
import { isAuthenticated } from '../../utils/authCheck.js';
import { addSwapPeer, allowSwapRequests, getSwap, listActiveSwaps, listSwapPeers, listSwapRequests, listSwaps, reloadPolicy, removeSwapPeer, resendMessage, swapIn, swapOut } from '../../controllers/cln/peerswap.js';

const router = Router();

router.get('/reloadPolicy', isAuthenticated, reloadPolicy);
router.get('/swap/:swapId', isAuthenticated, getSwap);
router.get('/listSwaps', isAuthenticated, listSwaps);
router.get('/listActiveSwaps', isAuthenticated, listActiveSwaps);
router.get('/listSwapRequests', isAuthenticated, listSwapRequests);
router.get('/listSwapPeers', isAuthenticated, listSwapPeers);
router.get('/allowSwapRequests/:isAllowed', isAuthenticated, allowSwapRequests);
router.get('/addPeer/:list/:pubkey', isAuthenticated, addSwapPeer);
router.get('/removePeer/:list/:pubkey', isAuthenticated, removeSwapPeer);
router.get('/resendMessage/:swapId', isAuthenticated, resendMessage);
router.post('/swapOut', isAuthenticated, swapOut);
router.post('/swapIn', isAuthenticated, swapIn);

export default router;

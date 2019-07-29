<?php

namespace Restoreddev\RapidCheckout\ViewModel;

use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Quote\Model\QuoteIdToMaskedQuoteIdInterface;

class Checkout implements \Magento\Framework\View\Element\Block\ArgumentInterface
{
	protected $checkoutSession;
	protected $quoteIdToMaskedQuoteId;

    public function __construct(
    	CheckoutSession $checkoutSession,
    	QuoteIdToMaskedQuoteIdInterface $quoteIdToMaskedQuoteId
    ) {
    	$this->checkoutSession = $checkoutSession;
    	$this->quoteIdToMaskedQuoteId = $quoteIdToMaskedQuoteId;
    }

    public function getQuoteIdMasked()
    {
    	$quote = $this->checkoutSession->getQuote();

    	return $this->quoteIdToMaskedQuoteId->execute($quote->getId());
    }

    public function hasQuote()
    {
        return $this->checkoutSession->hasQuote();
    }
}


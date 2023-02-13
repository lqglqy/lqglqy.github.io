# 买卖股票的最佳时机解题备忘

1.预定最低点Low=prices[0],在遍历过程中只要有小于low的数值即设定该值为low；

2.从prices[1]开始遍历，只要prices[i]与low的差值大于diff（预先设定为0）,那么diff即为该值；

```
int maxProfit(int* prices, int pricesSize){
    int low = prices[0];
    int diff = 0;
    for (int i = 1; i < pricesSize; i ++) {
        if (prices[i] > low && prices[i] - low > diff) {
            diff = prices[i] - low;
        } else if (prices[i] < low) {
            low = prices[i];
        }
    }

    return diff;
}
```

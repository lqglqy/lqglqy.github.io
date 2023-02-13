# 链表反转解题思路

1->2->3->4->5

## 迭代

要点在于要设定一个空的prev指针，然后从head开始一个一个向前指。

```
struct ListNode * prev = NULL;
struct ListNode * curr = head;
while (curr) {
  struct ListNode * next = curr->next;
  curr->next = prev;
  prev = curr;
  curr = next;
}
return prev;
```

## 递归

要点在于要用到head->next->next = head

```
if (head == NULL || head->next == NULL) return head;

struct ListNode * new_head = reverselist(head->next);
head->next->next = head;
head->next = NULL;
return new_head;
```

---
layout: post
title:  "How to detect sqli substring base on YanShi"
date:   2020-03-25 10:14:00 +0800
categories: match
---

# 背景介绍
	sql注入检测的一种完美方案是通过识别输入payload是否符合sql的语法片断，
	并结合词法分析的字段判断危害程度。以下是利用长亭开源的一套上下文关文法
	识别的有限状态机生成工具YanShi来进行sql片断语法判断的使用过程。
	
# 什么是YanShi
	yanshi是由长亭开源的一套用于可以根据接近上下文无关文法生成有限状态机的工具，同时支持子语法匹配模式。

	https://github.com/chaitin/yanshi

	http://maskray.me/blog/2016-06-11-yanshi-automaton-generator

# 如何使用？
	详细的使用可以直接参考github内容，这里只描述与片断语法检测相关的一个例子：

	以检测1' or '1'='1' 为例构造语法文件如下：
	```
	c++ {
	enum VAR_ID {
	SELECT=0,
	SET_QUANTIFIER_ALL,
	SET_QUANTIFIER_DISTINICT,
	WHERE,
	OR,
	SQL_VAR_MAX,
	};
	 
	struct sql_t {
	#define SQL_POS_START_MASK 0x01
	#define SQL_POS_END_MASK 0x02
	char mask;
	int weight;
	} sql_var[SQL_VAR_MAX];
	void sql_set_mask(enum VAR_ID id, char pos)
	{
	    sql_var[id].mask |= pos;
	}
	void sql_set_show()
	{
	    for (int i=0;i<SQL_VAR_MAX;i++) {
	        printf("var id:[%d] mask:[%d]\n", i, sql_var[i].mask);
	    }
	}
	}
	export main=query
	 
	action DISTINCTstart {
	puts("start DISTINCT");
	sql_set_mask(SET_QUANTIFIER_DISTINICT, SQL_POS_START_MASK);
	}
	action DISTINCTend {
	puts("end DISTINCT");
	sql_set_mask(SET_QUANTIFIER_DISTINICT, SQL_POS_END_MASK);
	}
	action WHEREstart {
	puts("start WHERE");
	sql_set_mask(WHERE, SQL_POS_START_MASK);
	}
	action WHEREend {
	puts("end WHERE");
	sql_set_mask(WHERE, SQL_POS_END_MASK);
	}
	action ORstart {
	puts("start OR");
	sql_set_mask(OR, SQL_POS_START_MASK);
	}
	action ORend {
	puts("end OR");
	sql_set_mask(OR, SQL_POS_END_MASK);
	}
	action ALLstart {
	puts("start ALL");
	sql_set_mask(SET_QUANTIFIER_ALL, SQL_POS_START_MASK);
	}
	action ALLend {
	puts("end ALL");
	sql_set_mask(SET_QUANTIFIER_ALL, SQL_POS_END_MASK);
	}
	action selectstart {
	puts("start select");
	sql_set_mask(SELECT, SQL_POS_START_MASK);
	}
	action selectend {
	puts("end select");
	sql_set_mask(SELECT, SQL_POS_END_MASK);
	}
	quote='\''
	double_quote='"'
	digit=('0'|'1'|'2'|'3'|'4'|'5'|'6'|'7'|'8'|'9')
	simple_Latin_lower_case_letter=	('a'|'b'|'c'|'d'|'e'|'f'|'g'|'h'|'i'|'j'|'k'|'l'|'m'|'n'|'o'|'p'|'q'|'r'|'s'|'t'|'u'|'v'|'w'|'x'|'y'|'z')
	simple_Latin_upper_case_letter=('A'|'B'|'C'|'D'|'E'|'F'|'G'|'H'|'I'|'J'|'K'|'L'|'M'|'N'|'O'|'P'|'Q'|'R'|'S'|'T'|'U'|'V'|'W'|'X'|'Y'|'Z')
	simple_Latin_letter=simple_Latin_upper_case_letter|simple_Latin_lower_case_letter
	space=' '*|'\t'*
	optional_space=''|' '*|'\t'*
	end='\r'|'\n'
	ALL=('A'|'a')@ALLstart ('L'|'l') ('L'|'l') @ALLend
	DISTINCT=('D'|'d') @DISTINCTstart ('I'|'i') ('S'|'s') ('T'|'t') ('I'|'i') ('N'|'n') ('C'|'c') ('T'|'t') @DISTINCTend
	optional_set_quantifier=''|space ALL|space DISTINCT
	#query='SELECT' space optional_set_quantifier space select_list table_expression
	SELECT=('S'|'s') @selectstart ('E'|'e') ('L'|'l') ('E'|'e') ('C'|'c') ('T'|'t') @ selectend
	asterisk='*'
	#value_expression=
	#derived_column=
	#select_sublist=
	#select_list=asterisk|(select_sublist optional_comma_select_sublist)
	select_list=asterisk
	#from_clause=
	WHERE=('W'|'w') @WHEREstart ('H'|'h') ('E'|'e') ('R'|'r') ('E'|'e') @WHEREend
	OR=('O'|'o') @ORstart ('R'|'r') @ORend
	unsigned_integer=digit*
	exact_numeric_literal=unsigned_integer
	unsigned_numeric_literal=exact_numeric_literal
	optional_character_representation=''|(simple_Latin_letter|digit)*
	character_string_literal= quote optional_character_representation quote
	general_literal=character_string_literal
	unsigned_literal=unsigned_numeric_literal|general_literal
	unsigned_value_specification=unsigned_literal
	value_expression_primary=unsigned_value_specification
	numeric_primary=value_expression_primary
	factor=numeric_primary
	term=factor
	numeric_value_expression=term
	character_primary=value_expression_primary
	character_factor=character_primary
	character_value_expression=character_factor
	string_value_expression=character_value_expression
	value_expression=numeric_value_expression
	equals_operator='='
	comp_op=equals_operator
	row_value_constructor=value_expression
	comparison_predicate=row_value_constructor optional_space comp_op optional_space row_value_constructor
	predicate=comparison_predicate
	boolean_primary=predicate
	boolean_factor=boolean_primary
	boolean_term=boolean_factor
	search_condition=boolean_term|(!search_condition optional_space OR optional_space boolean_term)
	where_clause=WHERE space search_condition
	table_expression=where_clause
	 
	query=SELECT optional_set_quantifier space select_list space table_expression
	```

保存为select.ys

编译

yanshi --substring-grammar -S select.ys -o a.cc 

g++ a.cc -o a -O2 -std=c++11


![yanshi](/assets/yanshi.png)

ToDO：需要在end action中增加各关键字的权重，最后通过判断最终状态是否为true并计算权重值来判断是否sqli



